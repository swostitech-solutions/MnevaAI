import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const IV_BYTES = 16;

// AES-256-CBC with a random IV, prepended to the ciphertext into one blob
// (iv || ciphertext) so the server only ever handles one opaque base64
// string — it has no separate "iv" field to store and no reason to parse
// this blob's structure at all.
export async function encryptBase64(base64Plaintext, base64Key) {
  const keyWordArray = CryptoJS.enc.Base64.parse(base64Key);
  const ivBytes = await Crypto.getRandomBytesAsync(IV_BYTES);
  const ivWordArray = CryptoJS.lib.WordArray.create(ivBytes);
  const plaintextWordArray = CryptoJS.enc.Base64.parse(base64Plaintext);

  const encrypted = CryptoJS.AES.encrypt(plaintextWordArray, keyWordArray, {
    iv: ivWordArray,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const combined = ivWordArray.clone().concat(encrypted.ciphertext);
  return CryptoJS.enc.Base64.stringify(combined);
}

export function decryptToBase64(base64Blob, base64Key) {
  const keyWordArray = CryptoJS.enc.Base64.parse(base64Key);
  const combined = CryptoJS.enc.Base64.parse(base64Blob);

  // First 16 bytes (4 words) are the IV; the rest is ciphertext.
  const ivWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), IV_BYTES);
  const ciphertextWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - IV_BYTES);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ciphertextWordArray },
    keyWordArray,
    { iv: ivWordArray, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return CryptoJS.enc.Base64.stringify(decrypted);
}
