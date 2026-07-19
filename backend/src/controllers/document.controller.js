import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../config/prisma.js'
import { memoryService } from '../services/memory.service.js'
import { qdrantService } from '../services/qdrant.service.js'

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

async function persistFile(file) {
  const s3 = await getS3()
  const filename = `${Date.now()}-${file.originalname}`

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

  // Local disk — best effort, non-fatal on Render ephemeral filesystem
  try {
    const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads')
    await fs.mkdir(uploadDir, { recursive: true })
    const localPath = path.join(uploadDir, filename)
    await fs.writeFile(localPath, file.buffer)
    return localPath
  } catch {
    return filename // store just the filename, parsing already done from buffer
  }
}

async function deletePersistedFile(filePath) {
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
      const detail = parsed.error || 'No readable text found in the image. OCR failed or there was no extractable text.'
      return res.status(201).json({
        document, chunks: 0,
        preview: parsed.text ? parsed.text.slice(0, 500) : '',
        fileType: parsed.type, stored: [], note: detail,
      })
    }

    const chunks = chunkText(parsed.text, {
      documentId: document.id,
      documentTitle: title,
      fileType: parsed.type,
    })

    const stored = []
    for (const chunk of chunks) {
      const result = await memoryService.store({
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
      stored.push(result)
    }

    res.status(201).json({
      document, chunks: chunks.length,
      preview: parsed.text.slice(0, 500),
      fileType: parsed.type, stored,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
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
