import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://mneva-backend.onrender.com';

// Listeners notified when session expires (401) so screens can redirect to login
const _sessionExpiredListeners = new Set();
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

export async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Retrying reads heals short network changes and Render wake-ups without
  // ever retrying a POST/PATCH action that could create duplicate work.
  const retryable = (options.method || 'GET').toUpperCase() === 'GET';
  let lastError;
  for (let attempt = 0; attempt < (retryable ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        _notifySessionExpired();
        throw { status: 401, message: 'Session expired. Please sign in again.' };
      }
      if (!res.ok) throw { status: res.status, message: data.error || data.message || 'Request failed' };
      return data;
    } catch (err) {
      lastError = err?.name === 'AbortError'
        ? { status: 0, message: 'Request timed out. Check your connection.' }
        : err;
      // An authenticated or client-side response cannot be healed by retrying.
      if (!retryable || lastError?.status === 401 || (lastError?.status >= 400 && lastError?.status < 500)) throw lastError;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError;
}
