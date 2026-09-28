import { applyModelCompat } from './openaiCompat.js'

// News tabs used to go through the FULL agent loop (/api/agent/chat) just to
// get back a JSON array of made-up headlines — meaning every tap paid for
// the entire system prompt (AI profile, memory, live data, all 30+ tool
// descriptions) and a tool-calling round trip, none of which a "give me 6
// news stories" request needs at all. This calls OpenAI directly with a
// short prompt and nothing else, which is what actually made it slow.
//
// A short shared in-memory cache means the same (type, filter) combo across
// requests — and across users, since news isn't personal except by topic —
// is served instantly instead of re-asking the model every single tap.
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map()

const cacheKey = (type, filter) => `${type}:${String(filter || '').toLowerCase().trim()}`

function buildPrompt(type, filter) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const shape = 'Return ONLY a JSON object of the exact form {"stories": [...]} with exactly 6 items, no other keys or text. Each item: {"headline": string, "summary": string (2 sentences), "source": string, "category": string, "time": string, "readTime": string}.'
  if (type === 'trending') return `Today is ${today}. You are a trending news agent. List 6 currently trending/breaking news stories in India. ${shape}`
  if (type === 'discover') return `Today is ${today}. List 6 news stories about "${filter}". ${shape}`
  if (type === 'following') return `Today is ${today}. List 6 current news stories covering these topics the reader follows: ${filter}. ${shape}`
  return `Today is ${today}. You are a news agent for Indian urban professionals. List 6 current top news stories relevant to India covering tech, business, politics, sports, health and startups. ${shape}`
}

export async function getNewsStories(type, filter) {
  const key = cacheKey(type, filter)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { stories: cached.stories, cached: true }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OpenAI is not configured')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'

  const payload = applyModelCompat({
    model,
    messages: [{ role: 'user', content: buildPrompt(type, filter) }],
    response_format: { type: 'json_object' },
  }, { temperature: 0.4 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  let response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('News request timed out')
    throw err
  } finally {
    clearTimeout(timeout)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI API error ${response.status}`)

  let parsed
  try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}') } catch { throw new Error('Could not parse news response') }
  const stories = Array.isArray(parsed.stories) ? parsed.stories : []
  if (stories.length) cache.set(key, { at: Date.now(), stories })
  return { stories, cached: false }
}
