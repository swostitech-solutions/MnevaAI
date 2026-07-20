import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import {
  deleteDocument,
  getDocuments,
  uploadDocument,
} from '../controllers/document.controller.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept everything — controller validates type
    cb(null, true)
  },
})

// Ensure local uploads dir exists as fallback when S3 is not configured
if (!process.env.AWS_S3_BUCKET) {
  const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
}

router.get('/', getDocuments)
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err || (!req.file && req.body?.fileBase64)) {
      if (req.body?.fileBase64 && req.body?.fileName) {
        const base64 = String(req.body.fileBase64).replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        if (!buffer.length) return res.status(400).json({ error: 'Empty file data received' })
        req.file = {
          buffer,
          originalname: req.body.fileName,
          mimetype: req.body.mimeType || 'application/octet-stream',
          size: buffer.length,
        }
        return next()
      }
      return res.status(400).json({ error: err ? `File upload error: ${err.message}` : 'file is required' })
    }
    next()
  })
}, uploadDocument)
router.delete('/:id', deleteDocument)

export default router
