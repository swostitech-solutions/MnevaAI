import test from 'node:test'
import assert from 'node:assert/strict'
import { decideGate, GATED_DOMAINS } from '../src/services/pendingActions.service.js'

function domainTrust(level, overrides = {}) {
  return { level, enabled: true, ...overrides }
}

test('S-11: an ungated tool always executes regardless of level', () => {
  const outcome = decideGate('get_daily_brief', domainTrust(1), 0, null, { autonomous: true })
  assert.deepEqual(outcome, { mode: 'execute', domain: null })
})

test('S-11: a disabled domain blocks a gated tool at any level', () => {
  const outcome = decideGate('log_health_data', domainTrust(4, { enabled: false }), 0, null, { autonomous: true })
  assert.equal(outcome.mode, 'blocked')
  assert.equal(outcome.reason, 'domain_disabled')
})

test('S-11: a >= ₹1000 payment is always pending, independent of trust level (hard safety floor)', () => {
  for (const level of [1, 2, 3, 4]) {
    const outcome = decideGate('initiate_payment', domainTrust(level), 1000, null, { autonomous: true })
    assert.equal(outcome.mode, 'pending', `level ${level} should still require approval for >= ₹1000`)
  }
  // Also true for a direct user command (autonomous: false) — money moving
  // always needs a tap no matter how the call got here.
  const direct = decideGate('initiate_payment', domainTrust(4), 1500, null, { autonomous: false })
  assert.equal(direct.mode, 'pending')
})

test('S-11: a < ₹1000 payment is not forced pending by the amount floor alone', () => {
  const outcome = decideGate('initiate_payment', domainTrust(4), 500, null, { autonomous: true })
  assert.notEqual(outcome.mode, 'pending')
})

test('S-11: a direct user command (autonomous: false) bypasses staged gating for every tool except send_email', () => {
  for (const tool of Object.keys(GATED_DOMAINS)) {
    if (tool === 'send_email' || tool === 'initiate_payment') continue
    const outcome = decideGate(tool, domainTrust(1), 0, null, { autonomous: false })
    assert.equal(outcome.mode, 'execute', `${tool} at L1 as a direct command should execute, not block`)
  }
})

test('S-11: send_email as a direct command still goes through the L1-L4 staged check', () => {
  assert.equal(decideGate('send_email', domainTrust(1), 0, null, { autonomous: false }).mode, 'blocked')
  assert.equal(decideGate('send_email', domainTrust(4), 0, null, { autonomous: false }).mode, 'execute')
})

test('S-11: autonomous staged gating — L1 blocks, L2/L3 pend, L4 executes', () => {
  assert.equal(decideGate('send_email', domainTrust(1), 0, null, { autonomous: true }).mode, 'blocked')
  assert.equal(decideGate('send_email', domainTrust(2), 0, null, { autonomous: true }).mode, 'pending')
  assert.equal(decideGate('send_email', domainTrust(3), 0, null, { autonomous: true }).mode, 'pending')
  assert.equal(decideGate('send_email', domainTrust(4), 0, null, { autonomous: true }).mode, 'execute')
})

test('S-11: GLOBAL_TEST_MODE_LEVEL overrides the effective level for every user at once', () => {
  const prev = process.env.GLOBAL_TEST_MODE_LEVEL
  try {
    process.env.GLOBAL_TEST_MODE_LEVEL = '4'
    // Real domainTrust.level is 1 (would normally block) — the test window forces L4 execute.
    const outcome = decideGate('send_email', domainTrust(1), 0, null, { autonomous: true })
    assert.equal(outcome.mode, 'execute')
  } finally {
    if (prev === undefined) delete process.env.GLOBAL_TEST_MODE_LEVEL
    else process.env.GLOBAL_TEST_MODE_LEVEL = prev
  }
})

test('S-11: a per-tester testLevelOverride wins over the global test window default', () => {
  const prev = process.env.GLOBAL_TEST_MODE_LEVEL
  try {
    process.env.GLOBAL_TEST_MODE_LEVEL = '4'
    const outcome = decideGate('send_email', domainTrust(1), 0, null, { autonomous: true, testLevelOverride: 1 })
    assert.equal(outcome.mode, 'blocked')
  } finally {
    if (prev === undefined) delete process.env.GLOBAL_TEST_MODE_LEVEL
    else process.env.GLOBAL_TEST_MODE_LEVEL = prev
  }
})

test('S-11: testLevelOverride has no effect outside an active test window', () => {
  const prev = process.env.GLOBAL_TEST_MODE_LEVEL
  try {
    delete process.env.GLOBAL_TEST_MODE_LEVEL
    // Real level is 1 (blocked) — a stale testLevelOverride=4 must NOT leak through.
    const outcome = decideGate('send_email', domainTrust(1), 0, null, { autonomous: true, testLevelOverride: 4 })
    assert.equal(outcome.mode, 'blocked')
  } finally {
    if (prev === undefined) delete process.env.GLOBAL_TEST_MODE_LEVEL
    else process.env.GLOBAL_TEST_MODE_LEVEL = prev
  }
})

test('S-11: update_record/delete_record resolve their domain from input.module, not the tool name', () => {
  const outcome = decideGate('update_record', domainTrust(1), 0, 'health', { autonomous: true })
  assert.equal(outcome.domain, 'health')
  assert.equal(outcome.mode, 'blocked')
})
