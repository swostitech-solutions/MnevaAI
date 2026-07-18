import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../config/prisma.js'
import { memoryService } from '../services/memory.service.js'
import { qdrantService } from '../services/qdrant.service.js'

const SUPPORTED_DOCUMENT_TYPES = ['pdf', 'docx', 'text', 'zip', 'image']

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
    const filePath = req.file.path || req.file.originalname

    let parsed
    try {
      parsed = await parseFile(filePath, req.file.mimetype, req.file.buffer)
      if (!SUPPORTED_DOCUMENT_TYPES.includes(parsed.type)) {
        throw new Error(`Unsupported parsed document type: ${parsed.type}`)
      }
    } catch (parseErr) {
      return res.status(422).json({ error: `Could not parse file: ${parseErr.message}` })
    }

    const document = await prisma.document.create({
      data: { title, filePath, userId: req.user.id },
    })

    // If this is an image and OCR didn't find text, skip indexing and inform the user
    if (parsed.type === 'image' && parsed.ocr === false) {
      const detail = parsed.error || 'No readable text found in the image. OCR failed or there was no extractable text.'
      return res.status(201).json({
        document,
        chunks: 0,
        preview: parsed.text ? parsed.text.slice(0, 500) : '',
        fileType: parsed.type,
        stored: [],
        note: detail,
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
      document,
      chunks: chunks.length,
      preview: parsed.text.slice(0, 500),
      fileType: parsed.type,
      stored,
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
      const resolvedPath = path.isAbsolute(document.filePath)
        ? document.filePath
        : path.resolve(process.cwd(), document.filePath)

      try {
        await fs.unlink(resolvedPath)
      } catch {
        // ignore missing file artifacts
      }
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
