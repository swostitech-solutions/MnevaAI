import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFile } from '../src/documents/parser.js'
import { chunkText } from '../src/documents/chunker.js'
import { memoryService } from '../src/services/memory.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const sampleImage = path.resolve(__dirname, '../storage/uploads/1783316903468-WhatsApp Image 2026-07-02 at 10.09.00 AM.jpeg')

test('OCR pipeline extracts text, chunks it, and stores memory entries', async () => {
  const parsed = await parseFile(sampleImage, 'image/jpeg', null)
  assert.equal(parsed.type, 'image')
  assert.equal(parsed.ocr, true)
  assert.match(parsed.text, /Project:/i)

  const chunks = chunkText(parsed.text, {
    documentId: 'test-doc',
    documentTitle: 'ocr-test',
    fileType: parsed.type,
  })

  assert.ok(chunks.length > 0)

  const stored = await memoryService.store({
    userId: 'test-user',
    text: chunks[0].text,
    type: 'document',
    metadata: {
      documentId: 'test-doc',
      fileName: 'ocr-test.jpeg',
      chunkIndex: 0,
      totalChunks: chunks.length,
    },
  })

  assert.equal(stored.success, true)
  assert.ok(stored.pointId)
})

test('generic document questions still return recent uploaded content', async () => {
  const memoryEntry = await memoryService.store({
    userId: 'test-user',
    text: 'Project: crypto-skope task list with MetaMask wallet integration.',
    type: 'document',
    metadata: { documentId: 'test-doc-2' },
  })

  assert.equal(memoryEntry.success, true)

  const results = await memoryService.recall('read this and give me what is there', 'test-user', 5)
  assert.ok(results.length > 0)
  assert.match(String(results[0]?.payload?.text || ''), /Project:/i)
})
