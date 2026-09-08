import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PRODUCTION_BACKEND = 'https://mneva-backend-v2.onrender.com';

// TEMPORARY: force the emulator onto the production backend/DB so a
// production account can be tested there. Flip back to `false` to resume
// normal dev-mode behavior (local backend on Android/iOS emulators).
const FORCE_PRODUCTION_BACKEND = true;

const LOCAL_BACKEND = __DEV__ && !FORCE_PRODUCTION_BACKEND
  ? (Platform.OS === 'android'
      ? 'http://10.0.2.2:3001'
      : 'http://localhost:3001')
  : PRODUCTION_BACKEND;

export const BASE_URL = LOCAL_BACKEND;

// Listeners notified when session expires (401) so screens can redirect to login
const _sessionExpiredListeners = new Set();
const CACHE_PREFIX = 'mneva_api_cache:';
const _inFlightGets = new Map();

export function onSessionExpired(cb) {
  _sessionExpiredListeners.add(cb);
  return () => _sessionExpiredListeners.delete(cb);
}
function _notifySessionExpired() {
  _sessionExpiredListeners.forEach(cb => cb());
}

async function getToken() {
  // Kept in the Keychain/Keystore via expo-secure-store — see src/storage/auth.js.
  return SecureStore.getItemAsync('mneva_token');
}

function cacheKey(path, token) {
  // Keep cached responses isolated between accounts without persisting a token.
  return `${CACHE_PREFIX}${token?.slice(-16) || 'anonymous'}:${path}`;
}

function canUseCachedResponse(path, error) {
  // Never let a cached identity hide an expired or revoked session.
  return path !== '/api/auth/me'
    && error?.status !== 401
    && (!error?.status || error.status >= 500);
}

async function readCachedResponse(path, token) {
  if (path === '/api/auth/me') return null;
  const cached = await AsyncStorage.getItem(cacheKey(path, token)).catch(() => null);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    await AsyncStorage.removeItem(cacheKey(path, token)).catch(() => {});
    return null;
  }
}

// Wake Render free-tier backend immediately on app launch or before the next
// user action. This is a warm-up trigger, not a forced server restart.
let _lastPingAt = 0;
let _pingInFlight = null;
export async function pingBackend(timeoutMs = 8000) {
  // A screen with several apiFetch calls (loadData alone fires 7-11) used to
  // trigger one of these before *every single one* of them. Coalesce bursts
  // within the same short window into one real network round-trip instead of
  // one per call — this was needlessly multiplying request volume without
  // adding any actual freshness (the backend is either awake or it isn't on
  // a 20s timescale).
  if (_pingInFlight) return _pingInFlight;
  if (Date.now() - _lastPingAt < 20000) return true;

  _pingInFlight = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${BASE_URL}/api/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        _lastPingAt = Date.now();
        return res.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    } finally {
      _pingInFlight = null;
    }
  })();
  return _pingInFlight;
}

export async function apiFetch(path, options = {}) {
  // `retry: false` is used by higher-level recovery loops which already own
  // their retry/backoff policy. Do not pass this app-only option to fetch.
  const { retry, ...fetchOptions } = options;
  const token = await getToken();
  const cacheable = (fetchOptions.method || 'GET').toUpperCase() === 'GET';
  const retryableAuthPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/verify-email', '/api/auth/resend-otp'];
  const responseCacheKey = cacheKey(path, token);
  const requestKey = `${responseCacheKey}:${JSON.stringify(fetchOptions.headers || {})}`;
  if (cacheable && _inFlightGets.has(requestKey)) return _inFlightGets.get(requestKey);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  // If the backend has been sleeping, a quick /api/health probe before the user
  // action wakes it without forcing logout or a hard restart. This is the
  // practical equivalent of "restart on next click" while staying inside the
  // app lifecycle.
  if (path !== '/api/health' && !fetchOptions.headers?.['x-no-wake-check']) {
    await pingBackend().catch(() => {});
  }

  const request = (async () => {
    // Reads can safely retry on flaky mobile / Render connections, and auth
    // endpoints need the same protection during backend cold starts.
    const retryable = retry === true || (retry !== false && (cacheable || retryableAuthPaths.includes(path)));
    let lastError;
    const maxAttempts = retryable ? 5 : 1;
    const retryDelays = [250, 500, 1000, 2000, 3000];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          ...fetchOptions,
          cache: 'no-store',
          headers,
          body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined,
          signal: controller.signal,
        });
        if (res.status === 304) {
          throw { status: 503, message: 'Cached response has no body' };
        }
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          // Never auto-logout. Surface the 401 as an error so the caller can
          // retry or show a message, but never force the user to sign in again.
          throw { status: 401, message: 'Session expired. Please sign in again.' };
        }
        if (!res.ok) {
          const message = data.error || data.message || `Server request failed (HTTP ${res.status})`;
          // 429 is deliberately NOT retried here: several devices signed into
          // the same account share one rate-limit bucket server-side, so once
          // it's exhausted, every device gets 429 at once. Retrying immediately
          // just pours more requests into the same already-exhausted window,
          // extending the outage instead of waiting it out — a real incident,
          // not a hypothetical (see the 05:59-06:00 log storm on one account).
          const transientServerError = [408, 500, 502, 503, 504].includes(res.status);
          if (retryable && transientServerError && attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt] || 2000));
            continue;
          }
          throw { status: res.status, message };
        }
        if (cacheable) {
          AsyncStorage.setItem(responseCacheKey, JSON.stringify(data)).catch(() => {});
        }
        return data;
      } catch (err) {
        lastError = err?.name === 'AbortError'
          ? { status: 0, message: 'Request timed out. Check your connection.' }
          : err;
        const transientNetworkError = !lastError?.status || lastError?.status === 0 || [408, 500, 502, 503, 504].includes(lastError?.status);
        // An authenticated or explicitly rejected client-side response cannot be healed by retrying.
        // 429 included: hammering an already-exhausted rate-limit window only prolongs it.
        if (!retryable || lastError?.status === 401 || (lastError?.status >= 400 && lastError?.status < 500 && lastError?.status !== 408)) break;
        if (transientNetworkError && attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt] || 2000));
          continue;
        }
        break;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Do not blank a page while Render is replacing an instance. Only use the
    // last known response after fresh attempts have actually failed.
    if (cacheable && canUseCachedResponse(path, lastError)) {
      const cached = await readCachedResponse(path, token);
      if (cached !== null) return cached;
    }
    if (lastError?.status === 0 || lastError?.status === 503 || lastError?.status === 504 || lastError?.status === 500) {
      pingBackend();
    }
    throw lastError;
  })();

  if (!cacheable) return request;
  _inFlightGets.set(requestKey, request);
  request.finally(() => _inFlightGets.delete(requestKey)).catch(() => {});
  return request;
}
