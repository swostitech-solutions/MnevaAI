import test from 'node:test'
import assert from 'node:assert/strict'
import { redactPreferences } from '../src/queues/accountExport.queue.js'

test('S-11: redactPreferences strips Google/Outlook OAuth tokens from every namespace', () => {
  const input = {
    gmail: { tokens: { access_token: 'secret-access', refresh_token: 'secret-refresh' }, connectedAt: '2026-01-01' },
    calendar: { tokens: { access_token: 'secret' } },
    outlook: { tokens: { access_token: 'secret' }, email: 'me@example.com' },
    notifications: { push: true },
  }
  const redacted = redactPreferences(input)
  assert.equal(redacted.gmail.tokens, undefined)
  assert.equal(redacted.calendar.tokens, undefined)
  assert.equal(redacted.outlook.tokens, undefined)
  // non-token fields on the same namespace survive
  assert.equal(redacted.gmail.connectedAt, '2026-01-01')
  assert.equal(redacted.outlook.email, 'me@example.com')
  // untouched namespaces pass through as-is
  assert.deepEqual(redacted.notifications, { push: true })
})

test('S-11: redactPreferences strips Slack\'s flat botToken field', () => {
  const input = { slack: { botToken: 'xoxb-secret', teamId: 'T123' } }
  const redacted = redactPreferences(input)
  assert.equal(redacted.slack.botToken, undefined)
  assert.equal(redacted.slack.teamId, 'T123')
})

test('S-11: redactPreferences does not mutate the object it was given', () => {
  const input = { gmail: { tokens: { access_token: 'secret' } } }
  redactPreferences(input)
  assert.ok(input.gmail.tokens, 'original object must be untouched — a deep copy, not an in-place strip')
})

test('S-11: redactPreferences handles missing/malformed input without throwing', () => {
  assert.deepEqual(redactPreferences(null), {})
  assert.deepEqual(redactPreferences(undefined), {})
  assert.deepEqual(redactPreferences('not an object'), {})
  assert.deepEqual(redactPreferences({}), {})
})
