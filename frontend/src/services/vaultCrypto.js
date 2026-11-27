// Web's equivalent of mneva/src/storage/vaultKey.js + vaultCrypto.js — a
// device-bound (here: browser-profile-bound) AES-256-GCM key that never
// leaves this browser and is never sent to the server. Generated
// non-extractable, so even this code can never read the raw key bytes out
// of it; it's stored as an opaque CryptoKey handle in IndexedDB (which can
// persist non-extractable CryptoKey objects via structured clone) so it
// survives reloads. By design this key is NOT the same as any mobile
// device's key and files encrypted here can't be opened elsewhere — same
// zero-knowledge, no-cross-device-sync tradeoff mobile already has.
const DB_NAME = 'mneva-vault'
const STORE = 'keys'
const KEY_ID = 'vault-key'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let cachedKey = null

async function getVaultKey() {
  if (cachedKey) return cachedKey
  const db = await openDb()
  let key = await idbGet(db, KEY_ID)
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await idbSet(db, KEY_ID, key)
  }
  cachedKey = key
  return key
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Returns base64(iv || ciphertext) — AES-GCM's own auth tag is appended to
// the ciphertext by WebCrypto, so no separate HMAC step is needed (unlike
// mobile's older AES-CBC-then-HMAC format).
export async function encryptToBase64(bytes) {
  const key = await getVaultKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes))
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, iv.length)
  return bytesToBase64(combined)
}

export async function decryptFromBase64(b64) {
  const key = await getVaultKey()
  const combined = base64ToBytes(b64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new Uint8Array(plain)
}
