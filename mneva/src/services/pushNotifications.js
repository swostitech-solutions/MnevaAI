import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api/client';

const STORED_TOKEN_KEY = 'mneva_push_token';

// Expo Go dropped Android remote-notification support entirely in SDK 53 —
// merely IMPORTING expo-notifications' native module trips an internal
// push-token listener that throws synchronously and crashes the whole app
// with a red screen before any screen renders, regardless of whether our own
// code ever calls a notification API. A plain `import` is hoisted and always
// runs, so the only way to actually avoid this is to never let the module
// load in the first place — hence the conditional `require` below instead of
// a static import. This has nothing to do with Firebase/credentials; it's an
// Expo Go-only limitation. A real build (dev client or the EAS `preview`
// APK) doesn't have this restriction and behaves normally.
const isExpoGo = Constants.executionEnvironment === 'storeClient';
// eslint-disable-next-line global-require
const Notifications = isExpoGo ? null : require('expo-notifications');

if (Notifications) {
  // Without this, Expo suppresses the OS banner while the app is in the
  // foreground — background/killed-app delivery would work fine, but it
  // would look like foreground alerts had stopped, since nothing shows on
  // screen.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function registerForPushNotifications() {
  if (!Notifications) return null;
  try {
    if (Platform.OS === 'android') {
      // Required on Android 8+ for a notification to show/sound at all —
      // without a channel the OS silently drops it.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Mneva alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1F9A5A',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    await apiFetch('/api/push/register', {
      method: 'POST',
      body: { token, platform: Platform.OS },
    });
    await AsyncStorage.setItem(STORED_TOKEN_KEY, token);
    return token;
  } catch {
    // Registration is best-effort — the rest of the app must not break if a
    // device can't get a push token (emulator without Play services, etc.).
    return null;
  }
}

export async function unregisterPushNotifications() {
  try {
    const token = await AsyncStorage.getItem(STORED_TOKEN_KEY);
    if (!token) return;
    await apiFetch('/api/push/register', { method: 'DELETE', body: { token } }).catch(() => {});
    await AsyncStorage.removeItem(STORED_TOKEN_KEY);
  } catch {
    // Best-effort cleanup — logout must proceed either way.
  }
}
