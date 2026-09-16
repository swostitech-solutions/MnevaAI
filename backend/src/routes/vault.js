import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import {
  listVaultFiles,
  uploadVaultFile,
  downloadVaultFile,
  deleteVaultFile,
} from '../controllers/vault.controller.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  // Ciphertext runs ~33% larger than the original file (base64 + IV
  // overhead) before this, and another ~33% again from the base64 JSON
  // transport itself — 40MB here comfortably covers a real-world 20MB file.
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true),
})

if (!process.env.AWS_S3_BUCKET) {
  const uploadDir = path.resolve(process.cwd(), 'storage', 'vault')
  fs.mkdirSync(uploadDir, { recursive: true })
}

router.get('/', listVaultFiles)
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err || (!req.file && req.body?.fileBase64)) {
      if (req.body?.fileBase64 && req.body?.fileName) {
        const buffer = Buffer.from(String(req.body.fileBase64), 'base64')
        if (!buffer.length) return res.status(400).json({ error: 'Empty file data received' })
        req.file = {
          buffer,
          originalname: req.body.fileName,
          mimetype: req.body.mimeType || 'application/octet-stream',
        }
        return next()
      }
      return res.status(400).json({ error: err ? `File upload error: ${err.message}` : 'file is required' })
    }
    next()
  })
}, uploadVaultFile)
router.get('/:id/download', downloadVaultFile)
router.delete('/:id', deleteVaultFile)

export default router
