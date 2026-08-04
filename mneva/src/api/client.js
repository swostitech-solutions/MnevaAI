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

  // 15-second timeout per request — prevents hanging on stale connections
  // Use 50s for cold-start tolerance (Render free tier can take 30-50s to wake)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Token expired or invalid — notify app to redirect to login
      _notifySessionExpired();
      throw { status: 401, message: 'Session expired. Please sign in again.' };
    }

    if (!res.ok) {
      throw { status: res.status, message: data.error || data.message || 'Request failed' };
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw { status: 0, message: 'Request timed out. Check your connection.' };
    }
    throw err;
  }
}
