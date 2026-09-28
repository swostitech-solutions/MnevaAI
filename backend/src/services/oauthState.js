import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// Every Google connect flow (Gmail, Calendar, Contacts, Drive, Tasks, Fit)
// round-trips a `state` through Google and trusts its `userId` to decide
// whose account the returned tokens get saved to. It used to be plain
// base64 JSON, so anyone could forge a state carrying another user's id and
// attach their own Google account to that user. Signing it with a server
// secret (plus a short expiry) means only a state this server issued, for
// the signed-in user who started the flow, is accepted — which Google's
// OAuth verification / CASA review also checks for.
//
// The payload stays base64url JSON with `sig` as the last field, so the
// callbacks' error-path helpers that only peek at `platform` to pick a
// redirect target keep working unchanged.
const STATE_TTL_MS = 15 * 60 * 1000

function getSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET or JWT_SECRET must be set to sign OAuth state')
  return secret
}

const toBase64Url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromBase64Url(value) {
  let s = String(value).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64').toString('utf8')
}

const sign = body => createHmac('sha256', getSecret()).update(body).digest('hex')

export function createOAuthState(data) {
  const payload = { ...data, ts: Date.now(), n: toBase64Url(randomBytes(9)) }
  const sig = sign(JSON.stringify(payload))
  return toBase64Url(Buffer.from(JSON.stringify({ ...payload, sig })))
}

// Returns the original payload, or null if the state is missing, tampered
// with, unsigned (issued before this change) or older than STATE_TTL_MS.
export function verifyOAuthState(state) {
  if (!state) return null
  try {
    const { sig, ...payload } = JSON.parse(fromBase64Url(state))
    if (typeof sig !== 'string' || !payload.userId || typeof payload.ts !== 'number') return null
    const expected = Buffer.from(sign(JSON.stringify(payload)), 'hex')
    const given = Buffer.from(sig, 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    if (Date.now() - payload.ts > STATE_TTL_MS || payload.ts > Date.now() + 60000) return null
    return payload
  } catch {
    return null
  }
}
