import OpenAI from 'openai'

let openaiClient = null

function getOpenAIClient() {
  if (openaiClient) return openaiClient
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

export async function transcribeAudio(file = {}) {
  const client = getOpenAIClient()
  if (!client) {
    throw new Error('OPENAI_API_KEY is not configured on the backend. Set it to enable Whisper transcription.')
  }

  const blob = file.buffer || file.blob
  if (!blob) {
    throw new Error('No audio data was provided for transcription.')
  }

  const audioFile = new File([blob], file.originalname || 'voice.webm', {
    type: file.mimetype || 'audio/webm',
  })

  const response = await client.audio.transcriptions.create({
    file: audioFile,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
    response_format: 'json',
  })

  return {
    text: String(response?.text || '').trim(),
    model: response?.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
  }
}
