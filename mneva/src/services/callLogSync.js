import { Platform, PermissionsAndroid } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api/client';

const LAST_SYNC_KEY = 'mneva_call_log_last_sync';
const ENABLED_KEY = 'mneva_call_log_enabled';
// First-ever sync only looks back this far — otherwise enabling the feature
// on a phone with years of call history would try to upload all of it in
// one batch instead of just enough to start judging "who do I talk to
// often" (see FREQUENT_WINDOW_DAYS/FREQUENT_MIN_DAYS in callLog.js).
const INITIAL_BACKFILL_DAYS = 30;

// Expo Modules are registered through Expo's module registry, not React
// Native's legacy NativeModules object. Optional loading keeps Expo Go and
// iOS safe: the capability simply reports unavailable there — Apple gives
// no app a way to read the call log at all, unlike notification access.
const nativeModule = Platform.OS === 'android'
  ? requireOptionalNativeModule('MnevaCallLogAccess')
  : null;

export const callLogAccessAvailable = Platform.OS === 'android' && !!nativeModule;

export async function hasCallLogPermission() {
  if (!callLogAccessAvailable) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
}

export async function requestCallLogPermission() {
  if (!callLogAccessAvailable) return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: 'Call log access',
    message: 'Mneva reads your call log to notice who you talk to regularly, so it can gently remind you if a day goes by without reaching someone you usually stay in touch with.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function isCallLogSyncEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function setCallLogSyncEnabled(enabled) {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  if (!enabled) await AsyncStorage.removeItem(LAST_SYNC_KEY);
}

// Reads call log entries since the last successful sync and uploads them in
// one batch. Meant to be called on app foreground/login, not on a tight
// timer — a missed call doesn't need sub-minute freshness, and re-reading
// the whole call history on every poll would be wasteful. Safe to call
// often: it's a no-op whenever the feature is off, unsupported, or nothing
// new has happened since the last call.
export async function syncCallLog() {
  if (!callLogAccessAvailable) return { synced: 0 };
  if (!(await isCallLogSyncEnabled())) return { synced: 0 };
  const granted = await hasCallLogPermission();
  if (!granted) return { synced: 0 };

  const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_KEY);
  const since = lastSyncRaw ? Number(lastSyncRaw) : Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000;

  let entries;
  try {
    entries = await nativeModule.queryCallLog(since);
  } catch {
    return { synced: 0 };
  }
  if (!entries || entries.length === 0) {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    return { synced: 0 };
  }

  try {
    await apiFetch('/api/call-log/sync', {
      method: 'POST',
      body: { entries: entries.map(e => ({ number: e.number, name: e.name, type: e.type, date: e.date, durationSec: e.durationSec })) },
    });
    // +1ms past the latest synced row so the same call never gets re-sent
    // on the next sync (the backend query is a strict ">", not ">=").
    const latest = Math.max(...entries.map(e => e.date));
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(latest + 1));
    return { synced: entries.length };
  } catch {
    // Leave LAST_SYNC_KEY untouched so this same window is retried on the
    // next sync instead of silently losing these entries.
    return { synced: 0 };
  }
}

// Called once right after the user grants permission — enables the feature
// locally and does the actual first sync in the same step, so Settings
// doesn't need two separate calls to get from "off" to "has data".
export async function enableCallLogSync() {
  if (!callLogAccessAvailable) {
    throw new Error('This feature requires the Mneva Android build. It is not available in Expo Go.');
  }
  const granted = await requestCallLogPermission();
  if (!granted) throw new Error('Call log permission was not granted.');
  await setCallLogSyncEnabled(true);
  await syncCallLog();
}

export async function disableCallLogSync() {
  await setCallLogSyncEnabled(false);
  await apiFetch('/api/call-log/disable', { method: 'POST' }).catch(() => {});
}
