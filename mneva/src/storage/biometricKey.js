import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import { apiFetch } from '../api/client';

const BIOMETRIC_KEY_STORAGE_KEY = 'mneva_biometric_device_key';
const AUTH_PROMPT = 'Confirm with biometrics to approve this payment';

// S-02: this secret is created once, behind requireAuthentication (Keystore
// on Android, Keychain/Secure Enclave on iOS) — the OS itself demands a
// real biometric/passcode check to ever create or read it, which is what
// makes the signature this produces actually mean something, instead of
// the old plain `biometricConfirmed: true` the client could just assert.
// It's registered with the server once (registerBiometricKey below) and
// never sent again after that.
async function readExistingKey() {
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_KEY_STORAGE_KEY, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    });
  } catch (err) {
    // The item existing but the user cancelling/failing the OS prompt
    // throws here — that must propagate as "couldn't confirm", never be
    // treated the same as "no key yet" (which would silently mint a fresh
    // unauthenticated key and defeat the whole gate).
    throw new Error('Biometric confirmation was cancelled or failed.');
  }
}

export async function hasBiometricKey() {
  // A plain existence check without requireAuthentication would itself
  // bypass the point of this store on Android (every op there requires
  // auth) — this is only ever used to decide whether registration is
  // needed, and registration on an existing key is harmless (same value).
  try {
    const key = await SecureStore.getItemAsync(BIOMETRIC_KEY_STORAGE_KEY, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    });
    return !!key;
  } catch {
    return false;
  }
}

export async function getOrCreateBiometricKey() {
  let key = await readExistingKey();
  if (!key) {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    key = CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(randomBytes));
    await SecureStore.setItemAsync(BIOMETRIC_KEY_STORAGE_KEY, key, {
      requireAuthentication: true,
      authenticationPrompt: AUTH_PROMPT,
    });
    await apiFetch('/api/auth/biometric-key', { method: 'POST', body: { key } });
  }
  return key;
}

// The full approve-a-payment flow: ask the server for a one-time challenge,
// read the device key (triggers the OS biometric prompt if the key exists;
// creates+registers it on first-ever use), HMAC the challenge with it.
// Throws (never silently returns a falsy signature) if biometric
// confirmation didn't happen — callers should let that surface as a
// cancelled/failed approval, not retry without it.
export async function getBiometricApproval() {
  const { challenge } = await apiFetch('/api/trust/biometric-challenge', { method: 'POST' });
  const key = await getOrCreateBiometricKey();
  const signature = CryptoJS.HmacSHA256(challenge, key).toString(CryptoJS.enc.Hex);
  return { biometricChallenge: challenge, biometricSignature: signature };
}
