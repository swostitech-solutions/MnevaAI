import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LOCK_KEY = 'mneva_app_lock_enabled';

// Device-local, not synced to the account via the backend — whether the
// app-open lock applies is a per-device choice (a phone and a tablet, or two
// people sharing an account, may reasonably want this on for one and off
// for the other), unlike the account-wide privacy toggles in Settings.
export async function isAppLockEnabled() {
  const val = await AsyncStorage.getItem(APP_LOCK_KEY);
  // Defaults on — matches the security-conscious default already used for
  // the separate "biometric gate for payments" toggle.
  return val === null ? true : val === 'true';
}

export async function setAppLockEnabled(enabled) {
  await AsyncStorage.setItem(APP_LOCK_KEY, enabled ? 'true' : 'false');
}
