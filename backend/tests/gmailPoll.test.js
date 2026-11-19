import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkArray } from '../src/queues/gmailPoll.queue.js'

test('chunkArray splits into groups of the given size, preserving order', () => {
  const chunks = chunkArray(['a', 'b', 'c', 'd', 'e'], 2)
  assert.deepEqual(chunks, [['a', 'b'], ['c', 'd'], ['e']])
})

test('chunkArray handles an empty list', () => {
  assert.deepEqual(chunkArray([], 5), [])
})

test('chunkArray handles a list smaller than the chunk size', () => {
  assert.deepEqual(chunkArray(['a'], 5), [['a']])
})
