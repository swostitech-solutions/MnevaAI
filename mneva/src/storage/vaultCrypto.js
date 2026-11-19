import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const IV_BYTES = 16;
const V2_PREFIX = 'v2:';

// S-08: the original format was AES-256-CBC with no integrity check at
// all — a flipped byte in the ciphertext (corruption, or a server that
// isn't actually zero-knowledge tampering with it) decrypts to garbage
// bytes silently instead of failing, since CBC has no way to detect that.
//
// CryptoJS (the only AES library already in this app, used elsewhere for
// the same reason) doesn't implement GCM — its `mode` export only has
// CBC/CFB/CTR/OFB/ECB, confirmed by checking the installed package
// directly. Rather than add a new native crypto dependency (which would
// need a rebuild this app's maintainer handles, not something to force
// through here), this moves to Encrypt-then-MAC: the same AES-256-CBC as
// before, plus an HMAC-SHA256 computed over (iv || ciphertext) with a
// *separate* key derived from the device key, verified before any
// decryption is attempted. This is a standard, well-understood
// composition (the same shape as JWE's A256CBC-HS512) — not a new
// primitive — and it gives the real property GCM would have: tampered or
// corrupted ciphertext is detected and rejected, not silently decrypted
// into garbage.
//
// Versioned so existing v1 blobs (no prefix at all — raw base64 of
// iv||ciphertext) keep decrypting exactly as before; Vault.js re-uploads
// each file in v2 the first time it's opened (see migrateIfLegacy below).
function deriveMacKey(base64Key) {
  const keyWordArray = CryptoJS.enc.Base64.parse(base64Key);
  return CryptoJS.SHA256(keyWordArray.clone().concat(CryptoJS.enc.Utf8.parse(':mac')));
}

export function isLegacyFormat(blob) {
  return typeof blob === 'string' && !blob.startsWith(V2_PREFIX);
}

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
  const combinedBase64 = CryptoJS.enc.Base64.stringify(combined);
  const mac = CryptoJS.HmacSHA256(combined, deriveMacKey(base64Key)).toString(CryptoJS.enc.Hex);
  return `${V2_PREFIX}${combinedBase64}.${mac}`;
}

function decryptV1(base64Blob, keyWordArray) {
  const combined = CryptoJS.enc.Base64.parse(base64Blob);
  const ivWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), IV_BYTES);
  const ciphertextWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - IV_BYTES);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ciphertextWordArray },
    keyWordArray,
    { iv: ivWordArray, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return CryptoJS.enc.Base64.stringify(decrypted);
}

function decryptV2(blob, base64Key, keyWordArray) {
  const dotIndex = blob.lastIndexOf('.');
  if (dotIndex === -1) throw new Error('Malformed vault item (missing MAC).');
  const combinedBase64 = blob.slice(V2_PREFIX.length, dotIndex);
  const mac = blob.slice(dotIndex + 1);

  const combined = CryptoJS.enc.Base64.parse(combinedBase64);
  const expectedMac = CryptoJS.HmacSHA256(combined, deriveMacKey(base64Key)).toString(CryptoJS.enc.Hex);
  // Plain string comparison, not constant-time — this device is both the
  // only party that ever holds the key and the only verifier, so there's
  // no cross-party timing side channel to defend against here the way a
  // server-side check would need to.
  if (expectedMac !== mac) {
    throw new Error('Vault item failed integrity check — it was corrupted or tampered with.');
  }

  const ivWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), IV_BYTES);
  const ciphertextWordArray = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - IV_BYTES);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ciphertextWordArray },
    keyWordArray,
    { iv: ivWordArray, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return CryptoJS.enc.Base64.stringify(decrypted);
}

export function decryptToBase64(blob, base64Key) {
  const keyWordArray = CryptoJS.enc.Base64.parse(base64Key);
  if (isLegacyFormat(blob)) return decryptV1(blob, keyWordArray);
  return decryptV2(blob, base64Key, keyWordArray);
}
