import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { NativeModules } from 'react-native';

const TOKEN_KEY = 'mneva_token';
const USER_KEY = 'mneva_user';
const ONBOARDED_KEY = 'mneva_onboarded';
const PHONE_NOTIFICATION_TOKEN_KEY = 'mneva_phone_notification_token';

// The JWT grants full account access, so it lives in the Keychain/Keystore
// (expo-secure-store) rather than AsyncStorage, which is unencrypted
// sandbox storage recoverable from device backups or a rooted/jailbroken
// device. Everything else here is non-sensitive profile/UI state.
export async function saveAuth(token, user) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
  ]);
}

export async function getStoredAuth() {
  const [token, userStr] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);
  return {
    token,
    user: userStr ? JSON.parse(userStr) : null,
  };
}

export async function clearAuth() {
  // Do not leave the Android listener able to submit alerts after logout.
  // Server-side revocation is done by the explicit Settings control; clearing
  // this private native copy immediately stops capture on this device.
  const clearNativeCapture = NativeModules.MnevaNotificationAccess?.clear;
  if (clearNativeCapture) await clearNativeCapture().catch(() => {});
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
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
