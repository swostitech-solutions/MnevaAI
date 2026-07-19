import { logger } from '../config/logger.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Uses DeepSeek chat to transcribe audio by converting to base64
// DeepSeek doesn't have a dedicated audio endpoint, so we use a
// workaround: save audio to temp file, use OpenAI-compatible Groq
// if available, otherwise fall back to a simple "type your message" response.
//
// Priority: Groq (free) → OpenAI → graceful fallback

async function tryGroq(audioBuffer, filename, mimetype) {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })

    const audioFile = new File([audioBuffer], filename, { type: mimetype })
    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
    })
    return String(response?.text || '').trim()
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

    const audioFile = new File([audioBuffer], filename, { type: mimetype })
    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'json',
    })
    return String(response?.text || '').trim()
  } catch (err) {
    logger.warn(`OpenAI transcription failed: ${err.message}`)
    return null
  }
}

export async function transcribeAudio(file = {}) {
  const buffer = file.buffer
  if (!buffer) throw new Error('No audio data was provided for transcription.')

  const filename = file.originalname || 'voice.m4a'
  const mimetype = file.mimetype || 'audio/m4a'

  // Try Groq first (free, fast)
  const groqText = await tryGroq(buffer, filename, mimetype)
  if (groqText) return { text: groqText, model: 'whisper-large-v3-turbo' }

  // Try OpenAI fallback
  const openaiText = await tryOpenAI(buffer, filename, mimetype)
  if (openaiText) return { text: openaiText, model: 'whisper-1' }

  // No transcription service configured
  throw new Error('No transcription service configured. Add GROQ_API_KEY (free at console.groq.com) to enable voice input.')
}
