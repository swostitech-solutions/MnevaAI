import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL, apiFetch } from '../api/client';

const TOKEN_KEY = 'mneva_phone_notification_token';
// Expo Modules are registered through Expo's module registry, not React
// Native's legacy NativeModules object. Optional loading keeps Expo Go and
// iOS safe: the capability simply reports unavailable there.
const nativeModule = Platform.OS === 'android'
  ? requireOptionalNativeModule('MnevaNotificationAccess')
  : null;

export const notificationCaptureAvailable = Platform.OS === 'android' && !!nativeModule;

/**
 * Creates a server-scoped credential and gives it only to the Android
 * NotificationListener service. The listener can submit notifications but
 * cannot use the user's normal sign-in token.
 */
export async function enableNotificationCapture() {
  if (Platform.OS !== 'android') {
    throw new Error('Reading notifications from other apps is available on Android only.');
  }
  if (!nativeModule) {
    throw new Error('This feature requires the Mneva Android build. It is not available in Expo Go.');
  }

  let deviceToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (!deviceToken) {
    const result = await apiFetch('/api/notifications/device-token', { method: 'POST' });
    deviceToken = result.deviceToken;
    if (!deviceToken) throw new Error('Could not create a secure device connection.');
    await AsyncStorage.setItem(TOKEN_KEY, deviceToken);
  }

  await nativeModule.configure(`${BASE_URL}/api/device-notifications/ingest`, deviceToken);
  await nativeModule.openSettings();
}

export async function disableNotificationCapture() {
  const deviceToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (deviceToken) {
    await apiFetch('/api/notifications/device-token', {
      method: 'DELETE', body: { deviceToken },
    }).catch(() => {});
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
  if (nativeModule) await nativeModule.clear();
}

export async function isNotificationCaptureEnabled() {
  if (!notificationCaptureAvailable) return false;
  return !!(await nativeModule.isEnabled());
}
