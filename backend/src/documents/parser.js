import fs from 'node:fs/promises'
import path from 'node:path'

export async function parseFile(filePath, mimetype, buffer) {
  const ext = path.extname(filePath).toLowerCase()

  // Normalise mimetype — mobile (React Native) often sends null or
  // 'application/octet-stream' regardless of actual file type.
  // Always trust the file extension over the mimetype.
  const isImageExt = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp'].includes(ext)
  const isZipExt = ext === '.zip'

  if (ext === '.pdf' || (!ext && mimetype === 'application/pdf')) {
    const pdfParse = (await import('pdf-parse')).default
    const data = buffer || await fs.readFile(filePath)
    const result = await pdfParse(data)
    return { text: result.text, pages: result.numpages, type: 'pdf' }
  }

  if (mimetype === 'application/zip' || isZipExt) {
    return parseZipArchive(filePath, buffer)
  }

  if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = (await import('mammoth')).default
    const data = buffer || await fs.readFile(filePath)
    const result = await mammoth.extractRawText({ buffer: data })
    return { text: result.value, type: 'docx' }
  }

  if (isImageExt || mimetype?.startsWith('image/')) {
    const data = buffer || await fs.readFile(filePath)
    const { text, ocr } = await parseImage(filePath, data)
    return { text, type: 'image', ocr }
  }

  const textExts = ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.py', '.log', '.xml', '.yaml', '.yml']
  if (textExts.includes(ext) || mimetype?.startsWith('text/')) {
    const data = buffer ? buffer.toString('utf8') : await fs.readFile(filePath, 'utf8')
    return { text: data, type: 'text' }
  }

  // Last resort — try reading as plain text (handles octet-stream from mobile)
  if (buffer) {
    try {
      const text = buffer.toString('utf8')
      if (text && text.length > 0) return { text, type: 'text' }
    } catch {}
  }

  throw new Error(`Unsupported file type: ${ext || '(no extension)'} — supported: PDF, DOCX, TXT, CSV, JSON, images`)
}

async function parseZipArchive(filePath, buffer) {
  const JSZip = (await import('jszip')).default
  const archiveData = buffer || await fs.readFile(filePath)
  const zip = await JSZip.loadAsync(archiveData)
  const entries = []

  const fileNames = Object.keys(zip.files).sort()
  for (const name of fileNames) {
    const entry = zip.files[name]
    if (entry.dir) continue
    const nestedBuffer = await entry.async('nodebuffer')
    try {
      const parsed = await parseFile(name, '', nestedBuffer)
      entries.push({ name, type: parsed.type, text: parsed.text, ocr: parsed.ocr || false })
    } catch (error) {
      entries.push({ name, type: 'unsupported', text: `Could not parse ${name}: ${error.message}`, ocr: false })
    }
  }

  if (!entries.length) {
    return { text: `Zip archive ${path.basename(filePath)} is empty or contains unsupported files.`, type: 'zip' }
  }

  const combined = entries.map((entry) => `--- ${entry.name} [${entry.type}] ---\n${(entry.text || '').trim()}`).join('\n\n')
  return { text: combined, type: 'zip', entries }
}

async function parseImage(filePath, buffer) {
  try {
    const { createWorker } = await import('tesseract.js')
    // On Render (Docker), Tesseract is installed system-wide via apk.
    // TESSDATA_PREFIX points to the system tessdata dir; falls back to local.
    const langPath = process.env.TESSDATA_PREFIX || '/usr/share/tessdata'
    const worker = await createWorker({ logger: () => {}, langPath })

    try {
      await worker.loadLanguage('eng')
      await worker.initialize('eng')
      const { data } = await worker.recognize(buffer || filePath)
      const text = String(data?.text || '').trim()

      if (!text) {
        return { text: '', ocr: false, error: 'No readable text found in the image.' }
      }

      return { text, ocr: true }
    } finally {
      await worker.terminate().catch(() => {})
    }
  } catch (error) {
    const message = error?.message || 'unknown OCR error'
    return { text: `OCR failed: ${message}`, ocr: false, error: message }
  }
}
