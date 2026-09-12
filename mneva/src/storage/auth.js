import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { NativeModules } from 'react-native';
import { unregisterPushNotifications } from '../services/pushNotifications';

const TOKEN_KEY = 'mneva_token';
const REFRESH_TOKEN_KEY = 'mneva_refresh_token';
const USER_KEY = 'mneva_user';
const ONBOARDED_KEY = 'mneva_onboarded';
const PHONE_NOTIFICATION_TOKEN_KEY = 'mneva_phone_notification_token';

// The JWT grants full account access, so it lives in the Keychain/Keystore
// (expo-secure-store) rather than AsyncStorage, which is unencrypted
// sandbox storage recoverable from device backups or a rooted/jailbroken
// device. Everything else here is non-sensitive profile/UI state.
export async function saveAuth(token, user, refreshToken) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    refreshToken ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken) : Promise.resolve(),
  ]);
}

// Used by the silent session-renewal path in api/client.js — updates just
// the access/refresh token pair after a successful /api/auth/refresh call,
// without touching the cached user profile.
export async function saveTokens(token, refreshToken) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    refreshToken ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken) : Promise.resolve(),
  ]);
}

export async function getStoredAuth() {
  const [token, refreshToken, userStr] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);
  return {
    token,
    refreshToken,
    user: userStr ? JSON.parse(userStr) : null,
  };
}

export async function clearAuth() {
  // Do not leave the Android listener able to submit alerts after logout.
  // Server-side revocation is done by the explicit Settings control; clearing
  // this private native copy immediately stops capture on this device.
  const clearNativeCapture = NativeModules.MnevaNotificationAccess?.clear;
  if (clearNativeCapture) await clearNativeCapture().catch(() => {});
  // Must happen before the token below is deleted — it needs the still-valid
  // session to tell the server to stop pushing to this device.
  await unregisterPushNotifications().catch(() => {});
  // Best-effort server-side revocation so this refresh token can't silently
  // renew a session again after the user has explicitly signed out. Uses the
  // same backend URL api/client.js resolves to — duplicated as a plain
  // constant (not a secret) rather than imported, since api/client.js itself
  // imports getStoredAuth from this file and a static import back here would
  // create a require cycle.
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY).catch(() => null);
  if (refreshToken) {
    await fetch('https://mneva-backend-v2.onrender.com/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(PHONE_NOTIFICATION_TOKEN_KEY).catch(() => {}),
    AsyncStorage.multiRemove([USER_KEY]),
  ]);
}

export async function hasSeenOnboarding() {
  const val = await AsyncStorage.getItem(ONBOARDED_KEY);
  return val === 'true';
}

export async function markOnboardingSeen() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
