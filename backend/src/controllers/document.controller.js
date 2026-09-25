import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { prisma } from '../config/prisma.js'
import { memoryService } from '../services/memory.service.js'
import { qdrantService } from '../services/qdrant.service.js'
import { logger } from '../config/logger.js'

const SUPPORTED_DOCUMENT_TYPES = ['pdf', 'docx', 'text', 'zip', 'image']

// ── S3 helpers (only initialised when AWS_S3_BUCKET is set) ──────────────────
let s3Client = null
async function getS3() {
  if (s3Client) return s3Client
  if (!process.env.AWS_S3_BUCKET) return null
  const { S3Client } = await import('@aws-sdk/client-s3')
  s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' })
  return s3Client
}

function safeExtension(originalname) {
  const ext = path.extname(originalname || '').toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

async function persistFile(file) {
  const s3 = await getS3()
  // Filename is fully generated server-side (UUID + validated extension only) —
  // file.originalname is attacker-controlled and must never reach the filesystem path.
  const filename = `${Date.now()}-${crypto.randomUUID()}${safeExtension(file.originalname)}`

  if (s3) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: `uploads/${filename}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    }))
    return `s3://${process.env.AWS_S3_BUCKET}/uploads/${filename}`
  }

  // Local disk fallback
  const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads')
  const localPath = path.join(uploadDir, filename)
  await fs.writeFile(localPath, file.buffer)
  return localPath
}

export async function deletePersistedFile(filePath) {
  if (!filePath) return
  if (filePath.startsWith('s3://')) {
    const s3 = await getS3()
    if (!s3) return
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const key = filePath.replace(`s3://${process.env.AWS_S3_BUCKET}/`, '')
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key })).catch(() => {})
    return
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  await fs.unlink(resolved).catch(() => {})
}

export async function readPersistedFile(filePath) {
  if (filePath.startsWith('s3://')) {
    const s3 = await getS3()
    if (!s3) throw new Error('S3 not configured')
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const key = filePath.replace(`s3://${process.env.AWS_S3_BUCKET}/`, '')
    const result = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }))
    const chunks = []
    for await (const chunk of result.Body) chunks.push(chunk)
    return Buffer.concat(chunks)
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  return fs.readFile(resolved)
}

const IMAGE_MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' }
const MAX_ATTACHMENT_TEXT_CHARS = 40000
const MAX_ATTACHMENT_IMAGE_BYTES = 8 * 1024 * 1024

// Loads a previously-uploaded file so it can be handed to the AI together
// with the user's question: a photo as an image the model can actually see,
// anything else as its full extracted text (not a few search-hit fragments).
export async function loadAttachmentForChat(userId, documentId) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, userId } })
  if (!doc?.filePath) return null
  const name = doc.title || 'attachment'
  const ext = path.extname(doc.filePath).toLowerCase() || path.extname(name).toLowerCase()
  const buffer = await readPersistedFile(doc.filePath)

  if (IMAGE_MIME_BY_EXT[ext]) {
    if (buffer.length > MAX_ATTACHMENT_IMAGE_BYTES) return { name, type: 'image', tooLarge: true }
    return { name, type: 'image', dataUrl: `data:${IMAGE_MIME_BY_EXT[ext]};base64,${buffer.toString('base64')}` }
  }

  const { parseFile } = await import('../documents/parser.js')
  const parsed = await parseFile(doc.filePath, undefined, buffer)
  const full = String(parsed.text || '')
  const truncated = full.length > MAX_ATTACHMENT_TEXT_CHARS
  return { name, type: 'document', text: full.slice(0, MAX_ATTACHMENT_TEXT_CHARS), truncated, totalChars: full.length }
}

export async function getDocuments(req, res) {
  try {
    const docs = await prisma.document.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ documents: docs })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function uploadDocument(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })

    const { parseFile } = await import('../documents/parser.js')
    const { chunkText } = await import('../documents/chunker.js')

    const title = req.body.title || req.file.originalname

    let parsed
    try {
      parsed = await parseFile(req.file.originalname, req.file.mimetype, req.file.buffer)
      if (!SUPPORTED_DOCUMENT_TYPES.includes(parsed.type)) {
        throw new Error(`Unsupported parsed document type: ${parsed.type}`)
      }
    } catch (parseErr) {
      return res.status(422).json({ error: `Could not parse file: ${parseErr.message}` })
    }

    const filePath = await persistFile(req.file)

    const document = await prisma.document.create({
      data: { title, filePath, userId: req.user.id },
    })

    if (parsed.type === 'image' && parsed.ocr === false) {
      // No OCR text — the photo is still saved, and the AI looks at it
      // directly when asked about it. Also describe it in the background so
      // it can be found later by content.
      res.status(201).json({
        document, chunks: 0, preview: '', fileType: parsed.type, stored: [],
        note: 'Photo saved — ask me about it and I will look at it.',
      })
      setImmediate(async () => {
        try {
          const { describeImage } = await import('../documents/vision.js')
          const description = await describeImage(req.file.buffer, req.file.mimetype || 'image/jpeg')
          const imgChunks = chunkText(description, { documentId: document.id, documentTitle: title, fileType: 'image' })
          for (const chunk of imgChunks) {
            await memoryService.store({
              userId: req.user.id, text: chunk.text, type: 'document',
              metadata: { documentId: document.id, fileName: req.file.originalname, chunkIndex: chunk.chunkIndex, totalChunks: imgChunks.length },
            })
          }
        } catch (err) {
          logger.warn(`Image description indexing failed for doc ${document.id}: ${err.message}`)
        }
      })
      return
    }

    const chunks = chunkText(parsed.text, {
      documentId: document.id,
      documentTitle: title,
      fileType: parsed.type,
    })

    // Respond immediately so Render's 30s timeout is not hit
    // Then index chunks in the background
    res.status(201).json({
      document,
      chunks: chunks.length,
      preview: parsed.text.slice(0, 500),
      fileType: parsed.type,
      stored: [],
    })

    // Background indexing — does not block the response
    setImmediate(async () => {
      try {
        for (const chunk of chunks) {
          await memoryService.store({
            userId: req.user.id,
            text: chunk.text,
            type: 'document',
            metadata: {
              documentId: document.id,
              fileName: req.file.originalname,
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunks.length,
            },
          })
        }
      } catch (err) {
        logger.warn(`Background indexing failed for doc ${document.id}: ${err.message}`)
      }
    })

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  }
}

export async function deleteDocument(req, res) {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    })

    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    if (document.filePath) {
      await deletePersistedFile(document.filePath)
    }

    await qdrantService.deleteByFilter('mneva_memory', {
      must: [{ key: 'metadata.documentId', match: { value: document.id } }],
    })

    await prisma.document.delete({
      where: { id: document.id },
    })

    res.json({ success: true, document })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
