import { logger } from '../config/logger.js'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Write buffer to a temp file and return a readable stream + cleanup fn
// This is required because Node.js OpenAI SDK needs fs.createReadStream,
// not a Web API File object (which doesn't work reliably in Node)
async function withTempFile(buffer, filename, fn) {
  const tmpPath = path.join(os.tmpdir(), `mneva_audio_${Date.now()}_${filename}`)
  await fs.writeFile(tmpPath, buffer)
  try {
    return await fn(tmpPath)
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }
}

async function tryGroq(audioBuffer, filename, mimetype) {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })

    return await withTempFile(audioBuffer, filename, async (tmpPath) => {
      const response = await client.audio.transcriptions.create({
        file: fsSync.createReadStream(tmpPath),
        model: 'whisper-large-v3-turbo',
        response_format: 'json',
      })
      return String(response?.text || '').trim()
    })
  } catch (err) {
    logger.warn(`Groq transcription failed: ${err.message}`)
    return null
  }
}

async function tryOpenAI(audioBuffer, filename, mimetype) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey })

    return await withTempFile(audioBuffer, filename, async (tmpPath) => {
      const response = await client.audio.transcriptions.create({
        file: fsSync.createReadStream(tmpPath),
        model: 'whisper-1',
        response_format: 'json',
      })
      return String(response?.text || '').trim()
    })
  } catch (err) {
    logger.warn(`OpenAI transcription failed: ${err.message}`)
    return null
  }
}

export async function transcribeAudio(file = {}) {
  const buffer = file.buffer
  if (!buffer || buffer.length === 0) throw new Error('No audio data was provided for transcription.')

  const filename = file.originalname || 'voice.m4a'
  const mimetype = file.mimetype || 'audio/m4a'

  const groqText = await tryGroq(buffer, filename, mimetype)
  if (groqText) return { text: groqText, model: 'whisper-large-v3-turbo' }

  const openaiText = await tryOpenAI(buffer, filename, mimetype)
  if (openaiText) return { text: openaiText, model: 'whisper-1' }

  throw new Error('No transcription service configured. Add GROQ_API_KEY (free at console.groq.com) to enable voice input.')
}
