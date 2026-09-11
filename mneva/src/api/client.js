import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getStoredAuth } from '../storage/auth';

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

// Several independent loops call apiFetch on their own schedule: Home's 8s
// self-heal retry, the 60s app heartbeat, focus/AppState listeners, socket
// reconnect refreshes. None of them know about each other. Previously, if the
// server ever answered 429, every one of those loops kept firing on its own
// cadence right through the rate-limit window — each attempt itself another
// hit against the same exhausted bucket — so the window never got a quiet
// moment to reset and the "whole app is offline" state could persist far
// longer than the server's actual 15-minute limit. This is a single shared
// gate: after any 429, every apiFetch call (regardless of which loop it came
// from) short-circuits locally — no network request at all — until the
// cooldown passes, then resumes normally.
const RATE_LIMIT_COOLDOWN_MS = 45000;
let _rateLimitedUntil = 0;

export function onSessionExpired(cb) {
  _sessionExpiredListeners.add(cb);
  return () => _sessionExpiredListeners.delete(cb);
}
function _notifySessionExpired() {
  _sessionExpiredListeners.forEach(cb => cb());
}

// Cache namespace: the account's own DB id, NOT the JWT. A token is re-issued
// fresh on every single login, so keying the cache by token meant a returning
// user re-logging in on the same device could never find their own cache
// from five minutes earlier — every fresh login looked exactly like a
// brand-new user with nothing cached, even though the whole point of caching
// was to make a familiar account's screens paint instantly. The account id
// is stable across logins, so cached data now survives logout/login normally.
async function getAuthContext() {
  const { token, user } = await getStoredAuth();
  return { token, cacheNamespace: user?.id || user?.email || null };
}

function cacheKey(path, namespace) {
  // Keep cached responses isolated between accounts.
  return `${CACHE_PREFIX}${namespace || 'anonymous'}:${path}`;
}

function canUseCachedResponse(path, error) {
  // Never let a cached identity hide an expired or revoked session.
  // 429 included: this is a rate-limit cooldown, not the account's data
  // actually disappearing — the last known-good screen is better than blank.
  return path !== '/api/auth/me'
    && error?.status !== 401
    && (!error?.status || error.status >= 500 || error.status === 429);
}

async function readCachedResponse(path, namespace) {
  if (path === '/api/auth/me') return null;
  const cached = await AsyncStorage.getItem(cacheKey(path, namespace)).catch(() => null);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    await AsyncStorage.removeItem(cacheKey(path, namespace)).catch(() => {});
    return null;
  }
}

// Every successful GET through apiFetch is already written to this cache;
// previously it was only ever read back as a fallback after a fresh attempt
// had failed. That means every screen showed a blank/loading state on every
// single open, even for data that hadn't actually changed since last time.
// Screens can call this on mount to paint the last known-good result
// immediately, then let their normal apiFetch call silently replace it with
// fresh data — "stale, then instant" instead of "blank, then eventually".
export async function peekCachedResponse(path) {
  const { cacheNamespace } = await getAuthContext();
  return readCachedResponse(path, cacheNamespace);
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
  // their retry/backoff policy. `timeoutMs` overrides the default 15s abort
  // window — the AI chat/draft endpoints run an agent loop of up to 10
  // sequential tool-calling iterations against OpenAI plus real tool
  // execution (Gmail, Calendar, Contacts...) per turn, which can genuinely
  // take longer than 15s on a complex request even when nothing is actually
  // wrong; the previous fixed timeout meant those calls could get aborted
  // client-side mid-flight and show "could not connect to the AI" even
  // though the server was still working (and could even complete the
  // action server-side after the client had already given up on it).
  const { retry, timeoutMs, ...fetchOptions } = options;
  const { token, cacheNamespace } = await getAuthContext();
  const cacheable = (fetchOptions.method || 'GET').toUpperCase() === 'GET';

  // `/api/health` is exempt from the server's rate limit too (see server.js
  // `skip`), and staying reachable during cooldown is what lets recovery
  // loops even notice the server is back. For everything else, skip the
  // network entirely during cooldown — the last known-good cached response
  // (if any) is a better result than yet another doomed request.
  if (path !== '/api/health' && Date.now() < _rateLimitedUntil) {
    const cooldownError = { status: 429, message: 'Too many requests — please wait a moment', retryable: false };
    if (cacheable && canUseCachedResponse(path, cooldownError)) {
      const cached = await readCachedResponse(path, cacheNamespace);
      if (cached !== null) return cached;
    }
    throw cooldownError;
  }
  const retryableAuthPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/verify-email', '/api/auth/resend-otp'];
  const responseCacheKey = cacheKey(path, cacheNamespace);
  const requestKey = `${responseCacheKey}:${JSON.stringify(fetchOptions.headers || {})}`;
  if (cacheable && _inFlightGets.has(requestKey)) return _inFlightGets.get(requestKey);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  // If the backend has been sleeping, a quick /api/health probe wakes it
  // without forcing logout or a hard restart. This must NOT block the real
  // request: on a paid, always-on instance (the current setup) the backend
  // is essentially never actually asleep, so awaiting this before every call
  // was adding a full serial network round-trip to every single page load
  // for no benefit. Fire it in parallel instead — if the backend really is
  // cold, the real request below will hit that the same way and retry.
  if (path !== '/api/health' && !fetchOptions.headers?.['x-no-wake-check']) {
    pingBackend().catch(() => {});
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
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 15000);
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
        if (res.status === 429) {
          // Open the shared cooldown gate so every other retry loop in the
          // app (not just this call) stops hitting the network until it passes.
          _rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
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
      const cached = await readCachedResponse(path, cacheNamespace);
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
