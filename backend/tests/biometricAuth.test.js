import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { signaturesMatch } from '../src/services/biometricAuth.service.js'

test('signaturesMatch accepts a correctly computed HMAC-SHA256 signature', () => {
  const key = 'dGVzdGtleTEyMzQ1Njc4OTBhYmNkZWZnaGlqa2xtbm8='
  const challenge = 'abc123deadbeef'
  const signature = crypto.createHmac('sha256', key).update(challenge).digest('hex')
  assert.equal(signaturesMatch(challenge, key, signature), true)
})

test('signaturesMatch matches the exact bytes CryptoJS.HmacSHA256 on the client would produce', () => {
  // Cross-checked once against CryptoJS.HmacSHA256(challenge, key).toString(CryptoJS.enc.Hex)
  // for this exact key/challenge pair — if either library's HMAC output
  // ever disagreed, every real payment approval would fail silently.
  const key = 'dGVzdGtleTEyMzQ1Njc4OTBhYmNkZWZnaGlqa2xtbm8='
  const challenge = 'abc123deadbeef'
  const knownGoodSignature = 'ab7dad378eb4ca5ef88c3adf236177c9f0817d05def79660845af79eedd2b25e'
  assert.equal(signaturesMatch(challenge, key, knownGoodSignature), true)
})

test('signaturesMatch rejects a wrong signature', () => {
  const key = 'dGVzdGtleTEyMzQ1Njc4OTBhYmNkZWZnaGlqa2xtbm8='
  const challenge = 'abc123deadbeef'
  const wrongSignature = crypto.createHmac('sha256', key).update('a different challenge').digest('hex')
  assert.equal(signaturesMatch(challenge, key, wrongSignature), false)
})

test('signaturesMatch rejects a signature computed with the wrong key', () => {
  const challenge = 'abc123deadbeef'
  const signature = crypto.createHmac('sha256', 'the-wrong-key').update(challenge).digest('hex')
  assert.equal(signaturesMatch(challenge, 'the-real-key', signature), false)
})

test('signaturesMatch rejects malformed/missing inputs instead of throwing', () => {
  assert.equal(signaturesMatch(undefined, 'key', 'sig'), false)
  assert.equal(signaturesMatch('challenge', undefined, 'sig'), false)
  assert.equal(signaturesMatch('challenge', 'key', undefined), false)
  assert.equal(signaturesMatch('challenge', 'key', 'not-valid-hex-zz'), false)
})
