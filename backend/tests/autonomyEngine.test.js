import test from 'node:test'
import assert from 'node:assert/strict'

process.env.DEEPSEEK_API_KEY = ''

const { runAutonomyEngine } = await import('../src/agents/autonomyEngine.js')

test('runAutonomyEngine returns a helpful fallback when DeepSeek is not configured', async () => {
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

test('runAutonomyEngine returns a helpful fallback when DeepSeek balance is insufficient', async () => {
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

    assert.equal(result.iterations, 0)
    assert.equal(result.mode, 'local-fallback')
    assert.match(result.response, /insufficient balance|add credits|top up/i)
  } finally {
    global.fetch = originalFetch
  }
})
