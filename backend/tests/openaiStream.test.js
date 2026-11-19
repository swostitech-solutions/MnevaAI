import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consumeOpenAIStream } from '../src/agents/autonomyEngine.js'

function sseResponse(lines) {
  const body = lines.map(l => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
  const encoder = new TextEncoder()
  const chunks = [encoder.encode(body)]
  let i = 0
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (i < chunks.length) return { done: false, value: chunks[i++] }
            return { done: true, value: undefined }
          },
        }
      },
    },
  }
}

test('consumeOpenAIStream reassembles plain text content and fires onDelta per chunk', async () => {
  const res = sseResponse([
    JSON.stringify({ choices: [{ delta: { role: 'assistant', content: '' }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
  ])
  const deltas = []
  const data = await consumeOpenAIStream(res, (chunk) => deltas.push(chunk))
  assert.equal(data.choices[0].message.content, 'Hello world')
  assert.equal(data.choices[0].finish_reason, 'stop')
  assert.deepEqual(deltas, ['Hello', ' world'])
  assert.equal(data.choices[0].message.tool_calls, undefined)
})

test('consumeOpenAIStream reassembles a streamed tool call without firing onDelta', async () => {
  const res = sseResponse([
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_', arguments: '' } }] }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'weather' } }] }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
  ])
  const deltas = []
  const data = await consumeOpenAIStream(res, (chunk) => deltas.push(chunk))
  assert.equal(deltas.length, 0)
  assert.equal(data.choices[0].finish_reason, 'tool_calls')
  assert.equal(data.choices[0].message.tool_calls.length, 1)
  assert.equal(data.choices[0].message.tool_calls[0].id, 'call_1')
  assert.equal(data.choices[0].message.tool_calls[0].function.name, 'get_weather')
  assert.equal(data.choices[0].message.tool_calls[0].function.arguments, '{"city":"Paris"}')
})

test('consumeOpenAIStream handles an SSE chunk split across two reads', async () => {
  const full = `data: ${JSON.stringify({ choices: [{ delta: { content: 'split' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
  const encoder = new TextEncoder()
  const bytes = encoder.encode(full)
  const mid = 10
  const parts = [bytes.slice(0, mid), bytes.slice(mid)]
  let i = 0
  const res = {
    body: {
      getReader() {
        return {
          async read() {
            if (i < parts.length) return { done: false, value: parts[i++] }
            return { done: true, value: undefined }
          },
        }
      },
    },
  }
  const deltas = []
  const data = await consumeOpenAIStream(res, (chunk) => deltas.push(chunk))
  assert.equal(data.choices[0].message.content, 'split')
  assert.deepEqual(deltas, ['split'])
})
