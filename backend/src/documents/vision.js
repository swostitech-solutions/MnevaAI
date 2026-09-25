import { applyModelCompat } from '../services/openaiCompat.js'

// Looks at a photo the way a person would: describes what's in it and copies
// out any visible text. Used to index uploaded photos (OCR alone only ever
// returned text, and the OCR package was never installed on the server, so
// every photo used to come back unreadable).
export async function describeImage(buffer, mimetype = 'image/jpeg') {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OpenAI is not configured')
  const model = process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'

  const payload = applyModelCompat({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image in detail — what it shows, any people/objects/charts/screens, and transcribe ALL visible text exactly as written. Be thorough and factual.' },
        { type: 'image_url', image_url: { url: `data:${mimetype};base64,${buffer.toString('base64')}` } },
      ],
    }],
  }, { temperature: 0.2 })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI API error ${response.status}`)
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('No description returned')
  return text.trim()
}
