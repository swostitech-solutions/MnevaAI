import test from 'node:test'
import assert from 'node:assert/strict'
import { GENESIS_HASH, canonicalEntryString, hashEntry, signHash, verifySignature } from '../src/services/ledgerSigning.js'

const sampleEntry = {
  id: 'entry-1',
  userId: 'user-1',
  tool: 'send_email',
  status: 'completed',
  action: { to: 'someone@example.com' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  seq: 1,
  prevHash: GENESIS_HASH,
}

test('S-11: hashEntry is deterministic for identical input', () => {
  assert.equal(hashEntry(sampleEntry), hashEntry({ ...sampleEntry }))
})

test('S-11: hashEntry changes if any hashed field is altered (tamper detection)', () => {
  const base = hashEntry(sampleEntry)
  assert.notEqual(hashEntry({ ...sampleEntry, status: 'rejected' }), base)
  assert.notEqual(hashEntry({ ...sampleEntry, action: { to: 'someone-else@example.com' } }), base)
  assert.notEqual(hashEntry({ ...sampleEntry, seq: 2 }), base)
  assert.notEqual(hashEntry({ ...sampleEntry, prevHash: 'f'.repeat(64) }), base)
})

test('S-11: canonicalEntryString defaults a missing prevHash to GENESIS_HASH', () => {
  const { prevHash, ...withoutPrevHash } = sampleEntry
  const str = canonicalEntryString(withoutPrevHash)
  assert.ok(str.includes(GENESIS_HASH))
})

test('S-11: signHash + verifySignature round-trips for a real hash', () => {
  const hash = hashEntry(sampleEntry)
  const signature = signHash(hash)
  assert.equal(verifySignature(hash, signature), true)
})

test('S-11: verifySignature rejects a signature for a different hash (tampered entry after signing)', () => {
  const hash = hashEntry(sampleEntry)
  const signature = signHash(hash)
  const tamperedHash = hashEntry({ ...sampleEntry, status: 'rejected' })
  assert.equal(verifySignature(tamperedHash, signature), false)
})

test('S-11: verifySignature rejects garbage input instead of throwing', () => {
  assert.equal(verifySignature('not-a-real-hash', 'not-a-real-signature'), false)
  assert.equal(verifySignature(hashEntry(sampleEntry), 'bm90LWEtcmVhbC1zaWduYXR1cmU='), false)
})
