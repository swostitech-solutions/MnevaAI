import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const TOKEN_KEY = 'mneva_token';
const USER_KEY = 'mneva_user';
const ONBOARDED_KEY = 'mneva_onboarded';
const PHONE_NOTIFICATION_TOKEN_KEY = 'mneva_phone_notification_token';

export async function saveAuth(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function getStoredAuth() {
  const [[, token], [, userStr]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
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
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, PHONE_NOTIFICATION_TOKEN_KEY]);
}

export async function hasSeenOnboarding() {
  const val = await AsyncStorage.getItem(ONBOARDED_KEY);
  return val === 'true';
}

export async function markOnboardingSeen() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
