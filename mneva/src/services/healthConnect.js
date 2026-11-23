import { Platform } from 'react-native';
import { apiFetch } from '../api/client';

// Google Fit's REST API is being shut down (end of 2026, no new sign-ups
// since May 2024) — Health Connect is Android's on-device replacement.
// Unlike Fit, there's no cloud/OAuth path: data lives on the device and is
// read here, then pushed to the SAME /api/health-data/sync endpoint the
// manual/iOS-Shortcut flow already uses (just with source: 'health_connect'),
// so the backend needs no new ingestion logic.

let HealthConnect = null;
function getLib() {
  if (Platform.OS !== 'android') return null;
  if (!HealthConnect) {
    try { HealthConnect = require('react-native-health-connect'); }
    catch { HealthConnect = null; }
  }
  return HealthConnect;
}

export const isHealthConnectSupported = () => Platform.OS === 'android';

const READ_RECORD_TYPES = ['Steps', 'HeartRate', 'SleepSession', 'TotalCaloriesBurned', 'Weight', 'Height'];

// SdkAvailabilityStatus: 1 = unavailable, 2 = update required, 3 = available
export async function getHealthConnectAvailability() {
  const hc = getLib();
  if (!hc) return { supported: false, available: false, updateRequired: false };
  try {
    const status = await hc.getSdkStatus();
    return {
      supported: true,
      available: status === 3,
      updateRequired: status === 2,
    };
  } catch {
    return { supported: true, available: false, updateRequired: false };
  }
}

export async function getHealthConnectGrantedTypes() {
  const hc = getLib();
  if (!hc) return [];
  try {
    const granted = await hc.getGrantedPermissions();
    return granted.filter(p => p.accessType === 'read').map(p => p.recordType);
  } catch {
    return [];
  }
}

export async function connectHealthConnect() {
  const hc = getLib();
  if (!hc) throw new Error('health_connect_unsupported');
  const initialized = await hc.initialize();
  if (!initialized) throw new Error('health_connect_init_failed');
  const granted = await hc.requestPermission(
    READ_RECORD_TYPES.map(recordType => ({ accessType: 'read', recordType }))
  );
  if (!granted.length) throw new Error('health_connect_permission_denied');
  return granted.map(p => p.recordType);
}

export function openHealthConnectSettings() {
  getLib()?.openHealthConnectSettings?.();
}

export async function disconnectHealthConnect() {
  try { await getLib()?.revokeAllPermissions?.(); } catch { /* best-effort */ }
}

// Reads today's data (midnight -> now) and shapes it exactly like the body
// POST /api/health-data/sync already expects from the manual-entry sheet.
export async function readTodayHealthConnectData() {
  const hc = getLib();
  if (!hc) return null;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayRange = { operator: 'between', startTime: startOfDay.toISOString(), endTime: now.toISOString() };
  // Sleep sessions normally start the night before — look back 24h further.
  const sleepRange = { operator: 'between', startTime: new Date(startOfDay.getTime() - 86400000).toISOString(), endTime: now.toISOString() };
  const weightRange = { operator: 'between', startTime: new Date(now.getTime() - 30 * 86400000).toISOString(), endTime: now.toISOString() };
  const heightRange = { operator: 'between', startTime: new Date(now.getTime() - 365 * 86400000).toISOString(), endTime: now.toISOString() };

  const [steps, heartRate, sleep, calories, weight, height] = await Promise.allSettled([
    hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: todayRange }),
    hc.aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: todayRange }),
    hc.aggregateRecord({ recordType: 'SleepSession', timeRangeFilter: sleepRange }),
    hc.aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter: todayRange }),
    hc.readRecords('Weight', { timeRangeFilter: weightRange }),
    hc.readRecords('Height', { timeRangeFilter: heightRange }),
  ]);

  const payload = { source: 'health_connect' };

  if (steps.status === 'fulfilled' && steps.value?.COUNT_TOTAL != null) {
    payload.steps = steps.value.COUNT_TOTAL;
  }
  if (heartRate.status === 'fulfilled' && heartRate.value?.BPM_AVG != null) {
    payload.heartRate = Math.round(heartRate.value.BPM_AVG);
  }
  if (sleep.status === 'fulfilled' && sleep.value?.SLEEP_DURATION_TOTAL != null) {
    payload.sleep = Math.round((sleep.value.SLEEP_DURATION_TOTAL / 60) * 10) / 10; // minutes -> hrs
  }
  if (calories.status === 'fulfilled' && calories.value?.ENERGY_TOTAL?.inKilocalories != null) {
    payload.calories = Math.round(calories.value.ENERGY_TOTAL.inKilocalories);
  }
  if (weight.status === 'fulfilled' && weight.value?.records?.length) {
    const latest = weight.value.records[weight.value.records.length - 1];
    if (latest?.weight?.inKilograms != null) payload.weight = Math.round(latest.weight.inKilograms * 10) / 10;
  }
  if (height.status === 'fulfilled' && height.value?.records?.length) {
    const latest = height.value.records[height.value.records.length - 1];
    if (latest?.height?.inMeters != null) payload.height = Math.round(latest.height.inMeters * 100); // m -> cm
  }

  return payload;
}

// Reads + pushes today's Health Connect data to the backend in one call —
// used right after connecting, and on every Health-screen focus/refresh.
export async function syncHealthConnectData() {
  const data = await readTodayHealthConnectData();
  if (!data) return null;
  return apiFetch('/api/health-data/sync', { method: 'POST', body: data });
}
