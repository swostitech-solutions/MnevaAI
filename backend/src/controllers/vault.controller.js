import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

// Mirrors document.controller.js's S3/disk-fallback storage pattern, but
// under its own `vault/` prefix and with no OCR/parsing step — the server
// receives and stores ciphertext (the client already encrypted the file
// with a device-only key before this ever reaches here), so it has no way
// to read these files even if it wanted to.
let s3Client = null
async function getS3() {
  if (s3Client) return s3Client
  if (!process.env.AWS_S3_BUCKET) return null
  const { S3Client } = await import('@aws-sdk/client-s3')
  s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' })
  return s3Client
}

async function persistVaultFile(buffer) {
  const s3 = await getS3()
  const filename = `${Date.now()}-${crypto.randomUUID()}.enc`

  if (s3) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: `vault/${filename}`,
      Body: buffer,
      ContentType: 'application/octet-stream',
    }))
    return `s3://${process.env.AWS_S3_BUCKET}/vault/${filename}`
  }

  const uploadDir = path.resolve(process.cwd(), 'storage', 'vault')
  await fs.mkdir(uploadDir, { recursive: true })
  const localPath = path.join(uploadDir, filename)
  await fs.writeFile(localPath, buffer)
  return localPath
}

async function readVaultFile(filePath) {
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

export async function deleteVaultFileBlob(filePath) {
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

export async function listVaultFiles(req, res) {
  try {
    const files = await prisma.vaultFile.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    })
    res.json({ files })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function uploadVaultFile(req, res) {
  try {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: 'file is required' })
    const filePath = await persistVaultFile(req.file.buffer)
    const file = await prisma.vaultFile.create({
      data: {
        userId: req.user.id,
        fileName: req.file.originalname || 'Untitled',
        mimeType: req.file.mimetype || 'application/octet-stream',
        filePath,
        size: req.file.buffer.length,
      },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    })
    res.json({ file })
  } catch (err) {
    logger.error(`Vault upload failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
}

export async function downloadVaultFile(req, res) {
  try {
    const file = await prisma.vaultFile.findUnique({ where: { id: req.params.id } })
    if (!file || file.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    const buffer = await readVaultFile(file.filePath)
    // The response body is still ciphertext — the client decrypts it with
    // its own device-held key, this endpoint just moves opaque bytes.
    res.json({ fileName: file.fileName, mimeType: file.mimeType, dataBase64: buffer.toString('base64') })
  } catch (err) {
    logger.error(`Vault download failed: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
}

export async function deleteVaultFile(req, res) {
  try {
    const file = await prisma.vaultFile.findUnique({ where: { id: req.params.id } })
    if (!file || file.userId !== req.user.id) return res.status(404).json({ error: 'Not found' })
    await deleteVaultFileBlob(file.filePath)
    await prisma.vaultFile.delete({ where: { id: file.id } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
