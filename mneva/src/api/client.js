import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

function getBaseUrl() {
  // In production build, use the hardcoded production URL
  if (!__DEV__) return 'https://mneva-backend.onrender.com';

  // In dev, derive host from Expo's dev server so it works on any network/IP
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3001`;

  // Final fallback
  return 'http://localhost:3001';
}

export const BASE_URL = getBaseUrl();

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

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw { status: res.status, message: data.error || data.message || 'Request failed' };
  }

  return data;
}
