import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'crypto'
import { logger } from '../config/logger.js'

// The zero-hash used as `prevHash` for the very first entry in a user's
// chain — an explicit, unambiguous "genesis" marker rather than null, so the
// chain-of-custody check has a concrete value to compare against.
export const GENESIS_HASH = '0'.repeat(64)

function loadPrivateKey() {
  const raw = process.env.LEDGER_SIGNING_PRIVATE_KEY?.trim()
  if (!raw) {
    // Dev-only fallback. A real deployment MUST set this env var: every
    // process restart would otherwise mint a new key, and every signature
    // issued under the old key becomes permanently unverifiable against the
    // new public key. This exists so local development doesn't crash without
    // the var set, not as something to rely on anywhere real.
    logger.warn('LEDGER_SIGNING_PRIVATE_KEY not set — using an ephemeral Ed25519 key for this process only. Set the env var in production so the ledger has one durable signing identity.')
    return generateKeyPairSync('ed25519').privateKey
  }
  const pem = raw.includes('BEGIN PRIVATE KEY') ? raw.replace(/\\n/g, '\n') : raw
  return createPrivateKey(pem)
}

const privateKey = loadPrivateKey()
const publicKey = createPublicKey(privateKey)

// Safe to expose to anyone — this is what lets a user, auditor, or investor
// verify the ledger themselves without trusting Mneva's server going forward.
export const LEDGER_PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

// The exact byte sequence that gets hashed for one ledger entry. Every field
// that could conceivably be altered after the fact must be included here —
// the previous implementation left `result` and `status` out of the hash
// entirely, so either could be edited without invalidating anything.
export function canonicalEntryString({ id, userId, tool, status, action, createdAt, seq, prevHash }) {
  return JSON.stringify({
    id,
    userId,
    tool,
    status,
    action,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    seq,
    prevHash: prevHash || GENESIS_HASH,
  })
}

export function hashEntry(entry) {
  return createHash('sha256').update(canonicalEntryString(entry)).digest('hex')
}

export function signHash(hashHex) {
  return cryptoSign(null, Buffer.from(hashHex, 'hex'), privateKey).toString('base64')
}

export function verifySignature(hashHex, signatureB64) {
  try {
    return cryptoVerify(null, Buffer.from(hashHex, 'hex'), publicKey, Buffer.from(signatureB64, 'base64'))
  } catch {
    return false
  }
}
