import test from 'node:test'
import assert from 'node:assert/strict'

process.env.OPENAI_API_KEY = ''
process.env.DEEPSEEK_API_KEY = ''

const { runAutonomyEngine, normalizeScheduledTime, requestedSchedulingTool } = await import('../src/agents/autonomyEngine.js')

test('runAutonomyEngine returns a helpful fallback when AI is not configured', async () => {
  process.env.OPENAI_API_KEY = ''
  process.env.DEEPSEEK_API_KEY = ''

  const result = await runAutonomyEngine({
    messages: [{ role: 'user', content: 'Summarize my day' }],
    user: { id: 'user-1', name: 'Test User', trustLevel: 2 },
    context: {},
  })

  assert.equal(result.iterations, 0)
  assert.equal(result.mode, 'local-fallback')
  assert.match(result.response, /local fallback|assistant mode|available|ready/i)
})

test('runAutonomyEngine treats placeholder keys as unconfigured', async () => {
  process.env.OPENAI_API_KEY = 'sk-your-key-here'
  process.env.DEEPSEEK_API_KEY = 'sk-your-key-here'

  const result = await runAutonomyEngine({
    messages: [{ role: 'user', content: 'Summarize my day' }],
    user: { id: 'user-2', name: 'Test User', trustLevel: 2 },
    context: {},
  })

  assert.equal(result.iterations, 0)
  assert.equal(result.mode, 'local-fallback')
  assert.match(result.response, /local fallback|assistant mode|available|ready/i)
})

test('runAutonomyEngine returns a quota error when the AI provider rejects the request', async () => {
  process.env.OPENAI_API_KEY = 'sk-valid-test-key'
  process.env.DEEPSEEK_API_KEY = 'sk-valid-test-key'
  const originalFetch = global.fetch

  global.fetch = async () => ({
    ok: false,
    status: 402,
    json: async () => ({ error: { message: 'Insufficient Balance' } }),
  })

  try {
    const result = await runAutonomyEngine({
      messages: [{ role: 'user', content: 'Summarize my day' }],
      user: { id: 'user-3', name: 'Test User', trustLevel: 2 },
      context: {},
    })

    assert.equal(result.iterations, 1)
    assert.equal(result.mode, 'local-fallback')
    assert.match(result.response, /insufficient balance|add credits|top up/i)
  } finally {
    global.fetch = originalFetch
  }
})

test('normalizeScheduledTime accepts common natural-language future dates', () => {
  const now = Date.now()

  const today = normalizeScheduledTime('today 11:59 pm', 'Asia/Kolkata')
  const tomorrow = normalizeScheduledTime('tomorrow 9:00 am', 'Asia/Kolkata')
  const nextWeek = normalizeScheduledTime('next Monday 2:15 pm', 'Asia/Kolkata')

  assert.ok(today instanceof Date)
  assert.ok(tomorrow instanceof Date)
  assert.ok(nextWeek instanceof Date)
  assert.ok(today.getTime() > now)
  assert.ok(tomorrow.getTime() > now)
  assert.ok(nextWeek.getTime() > now)
})

test('requestedSchedulingTool ignores greetings even after a previous scheduling request', () => {
  const result = requestedSchedulingTool([
    { role: 'user', content: 'Schedule a meeting tomorrow at 3pm' },
    { role: 'user', content: 'hi' },
  ])

  assert.equal(result, null)
})
