import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://mneva-backend-v2.onrender.com';

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
  return AsyncStorage.getItem('mneva_token');
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

// Wake Render free-tier backend immediately on app launch (fire-and-forget)
export function pingBackend() {
  fetch(`${BASE_URL}/api/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
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

  const request = (async () => {
    // Reads can safely retry on flaky mobile / Render connections, and auth
    // endpoints need the same protection during backend cold starts.
    const retryable = retry === true || (retry !== false && (cacheable || retryableAuthPaths.includes(path)));
    let lastError;
    const maxAttempts = retryable ? 3 : 1;
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
          _notifySessionExpired();
          throw { status: 401, message: 'Session expired. Please sign in again.' };
        }
        if (!res.ok) {
          throw {
            status: res.status,
            message: data.error || data.message || `Server request failed (HTTP ${res.status})`,
          };
        }
        if (cacheable) {
          AsyncStorage.setItem(responseCacheKey, JSON.stringify(data)).catch(() => {});
        }
        return data;
      } catch (err) {
        lastError = err?.name === 'AbortError'
          ? { status: 0, message: 'Request timed out. Check your connection.' }
          : err;
        // An authenticated or client-side response cannot be healed by retrying.
        if (!retryable || lastError?.status === 401 || (lastError?.status >= 400 && lastError?.status < 500)) break;
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)));
        }
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
    throw lastError;
  })();

  if (!cacheable) return request;
  _inFlightGets.set(requestKey, request);
  request.finally(() => _inFlightGets.delete(requestKey)).catch(() => {});
  return request;
}
