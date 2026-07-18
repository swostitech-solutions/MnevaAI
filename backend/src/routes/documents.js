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

// Use memory storage — controller handles S3 or local disk persistence
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

// Ensure local uploads dir exists as fallback when S3 is not configured
if (!process.env.AWS_S3_BUCKET) {
  const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
}

router.get('/', getDocuments)
router.post('/upload', upload.single('file'), uploadDocument)
router.delete('/:id', deleteDocument)

export default router
