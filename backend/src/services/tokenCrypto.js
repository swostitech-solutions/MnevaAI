import crypto from 'node:crypto'

// AES-256-GCM for OAuth tokens at rest (Gmail/Calendar/Fit/Contacts/Drive/
// Tasks refresh & access tokens) — these are stored inside User.preferences
// (a JSON column) and are themselves credentials: a leaked refresh token
// grants ongoing account access without needing the user's password.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ENC_PREFIX = 'encv1:'

let cachedKey = null
function getKey() {
  if (cachedKey) return cachedKey
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")')
  }
  cachedKey = key
  return key
}

export function isEncryptedToken(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

// value is a plain JS object/array (a token bundle: {access_token,
// refresh_token, expiry_date, ...}) — JSON-stringified, then encrypted.
export function encryptToken(value) {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptToken(value) {
  const key = getKey()
  const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}
