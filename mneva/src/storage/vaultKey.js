import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const VAULT_KEY_STORAGE_KEY = 'mneva_vault_encryption_key';

// This key is generated once per device and never leaves it — it's never
// sent to the server in any request, never included in a backup, and has
// no recovery path by design. Reinstalling the app or losing the device
// without this key means anything in the Vault is permanently unreadable;
// that's the actual point of the feature (the server holding a copy or a
// recovery key would defeat the "zero-knowledge" property entirely).
export async function hasVaultKey() {
  const key = await SecureStore.getItemAsync(VAULT_KEY_STORAGE_KEY);
  return !!key;
}

export async function getOrCreateVaultKey() {
  let key = await SecureStore.getItemAsync(VAULT_KEY_STORAGE_KEY);
  if (!key) {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    // No `Buffer` global in this app (unpolyfilled) — crypto-js's own
    // WordArray already has to be linked in for the actual AES cipher
    // (vaultCrypto.js), so it doubles as the byte-array-to-base64 path here.
    key = CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(randomBytes));
    await SecureStore.setItemAsync(VAULT_KEY_STORAGE_KEY, key);
  }
  return key;
}
