import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

// Called once on cold start (App.js), the same way push notifications are
// requested — so the OS permission prompt shows up right after install/
// first open instead of only whenever a screen happens to need it later.
// Safe to call every cold start: once the user has answered, this resolves
// immediately with the stored answer instead of re-prompting.
export async function requestLocationPermission() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// Best-effort nudge to turn Location Services back on if the OS-level
// toggle (not just the per-app permission) is off. Android can show a
// native "Turn on Location" resolution dialog directly; iOS has no
// equivalent API, so that case falls back to an Alert pointing at Settings.
async function ensureLocationServicesOn() {
  try {
    if (await Location.hasServicesEnabledAsync()) return true;
    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => {});
      return await Location.hasServicesEnabledAsync();
    }
    Alert.alert(
      'Location is off',
      'Turn on Location Services to see the weather for where you actually are.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  } catch {
    return false;
  }
}

// Current device coordinates for the dashboard's weather card, or null if
// permission isn't granted, location services are off, or the fix times
// out — never throws, so callers can always fall back to the profile
// city/country path on null.
export async function getCurrentCoords() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    if (!(await ensureLocationServicesOn())) return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}
