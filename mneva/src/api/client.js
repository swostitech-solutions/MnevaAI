import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://mneva-backend-v2.onrender.com';

// Listeners notified when session expires (401) so screens can redirect to login
const _sessionExpiredListeners = new Set();
const CACHE_PREFIX = 'mneva_api_cache:';

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
  const responseCacheKey = cacheKey(path, token);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  // Retrying reads heals short network changes and Render wake-ups without
  // ever retrying a POST/PATCH action that could create duplicate work.
  const retryable = retry !== false && (fetchOptions.method || 'GET').toUpperCase() === 'GET';
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
      if (cacheable && canUseCachedResponse(path, lastError)) {
        const cached = await AsyncStorage.getItem(responseCacheKey).catch(() => null);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch {
            await AsyncStorage.removeItem(responseCacheKey).catch(() => {});
          }
        }
      }
      // An authenticated or client-side response cannot be healed by retrying.
      if (!retryable || lastError?.status === 401 || (lastError?.status >= 400 && lastError?.status < 500)) throw lastError;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError;
}
