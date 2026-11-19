import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupToolBlocksByDomain } from '../src/agents/autonomyEngine.js'

test('groups same-domain tool calls together, keeping original order', () => {
  const toolBlocks = [
    { name: 'set_reminder', input: { message: 'call mom', time: '2026-11-20T10:00:00Z' } },
    { name: 'set_reminder', input: { message: 'call mom', time: '2026-11-20T10:00:00Z' } }, // duplicate identity
  ]
  const groups = groupToolBlocksByDomain(toolBlocks)
  assert.equal(groups.size, 1)
  const [entries] = groups.values()
  assert.equal(entries.length, 2)
  assert.equal(entries[0].tbIndex, 0)
  assert.equal(entries[1].tbIndex, 1)
})

test('splits different-domain tool calls into separate groups', () => {
  const toolBlocks = [
    { name: 'initiate_payment', input: {} },   // finance
    { name: 'send_email', input: {} },         // communications
    { name: 'add_pet', input: {} },            // family
  ]
  const groups = groupToolBlocksByDomain(toolBlocks)
  assert.equal(groups.size, 3)
  assert.ok(groups.has('finance'))
  assert.ok(groups.has('communications'))
  assert.ok(groups.has('family'))
})

test('generic update_record/delete_record calls group by input.module, not tool name', () => {
  const toolBlocks = [
    { name: 'update_record', input: { module: 'expense' } },
    { name: 'update_record', input: { module: 'expense' } },
    { name: 'delete_record', input: { module: 'familyTask' } },
  ]
  const groups = groupToolBlocksByDomain(toolBlocks)
  assert.equal(groups.size, 2)
  assert.ok(groups.has('generic:expense'))
  assert.ok(groups.has('generic:familyTask'))
  assert.equal(groups.get('generic:expense').length, 2)
})

test('update_record with no module falls back to a shared unknown bucket', () => {
  const toolBlocks = [
    { name: 'update_record', input: {} },
    { name: 'delete_record', input: {} },
  ]
  const groups = groupToolBlocksByDomain(toolBlocks)
  assert.equal(groups.size, 1)
  assert.ok(groups.has('generic:unknown'))
})
