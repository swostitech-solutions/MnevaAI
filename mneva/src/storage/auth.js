import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'mneva_token';
const USER_KEY = 'mneva_user';
const ONBOARDED_KEY = 'mneva_onboarded';

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
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function hasSeenOnboarding() {
  const val = await AsyncStorage.getItem(ONBOARDED_KEY);
  return val === 'true';
}

export async function markOnboardingSeen() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
