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
const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.get('/', getDocuments)
router.post('/upload', upload.single('file'), uploadDocument)
router.delete('/:id', deleteDocument)

export default router
