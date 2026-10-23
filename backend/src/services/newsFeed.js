import { applyModelCompat } from './openaiCompat.js'
import { tavilySearch } from './webSearch.js'

// News tabs used to go through the FULL agent loop (/api/agent/chat) just to
// get back a JSON array of made-up headlines — meaning every tap paid for
// the entire system prompt (AI profile, memory, live data, all 30+ tool
// descriptions) and a tool-calling round trip, none of which a "give me 6
// news stories" request needs at all. This calls OpenAI directly with a
// short prompt and nothing else, which is what actually made it slow.
//
// What this doesn't skip any more: an actual web search (Tavily). The old
// version asked the model to invent 6 "current" headlines purely from its
// own training data — not current at all, and not necessarily real. Every
// call now does a real search first and has the model summarize ONLY what
// that search actually returned, into the same {stories:[...]} shape the
// app already expects.
//
// A short shared in-memory cache means the same (type, filter) combo across
// requests — and across users, since news isn't personal except by topic —
// is served instantly instead of re-searching + re-asking the model every
// single tap.
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map()

const cacheKey = (type, filter) => `${type}:${String(filter || '').toLowerCase().trim()}`

function buildSearchQuery(type, filter) {
  if (type === 'trending') return 'trending breaking news India today'
  if (type === 'discover') return `latest news ${filter}`
  if (type === 'following') return `latest news ${filter}`
  return 'top news India today technology business politics sports health startups'
}

function buildSummaryPrompt(searchResults) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const shape = 'Return ONLY a JSON object of the exact form {"stories": [...]} with up to 6 items — fewer if the search results below don\'t genuinely support 6 distinct real stories; never invent extra ones just to reach 6. Each item: {"headline": string, "summary": string (2 sentences), "source": string, "category": string, "time": string, "readTime": string}.'
  return `Today is ${today}. Using ONLY the real web search results below — never anything from your own memory or training data — write up to 6 news story summaries. "source" must be the actual publisher name from the result it came from (e.g. "Times of India", "The Hindu"), not invented. If a result is too thin, a duplicate of another, or not really a news story, skip it rather than inventing details to fill it out.\n\nSearch results:\n${JSON.stringify(searchResults.map(r => ({ title: r.title, source_url: r.url, content: r.content })))}\n\n${shape}`
}

export async function getNewsStories(type, filter) {
  const key = cacheKey(type, filter)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { stories: cached.stories, cached: true }

  const { results } = await tavilySearch(buildSearchQuery(type, filter), { maxResults: 8, includeAnswer: false })
  if (!results.length) return { stories: [], cached: false }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OpenAI is not configured')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'

  const payload = applyModelCompat({
    model,
    messages: [{ role: 'user', content: buildSummaryPrompt(results) }],
    response_format: { type: 'json_object' },
  }, { temperature: 0.2 })

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
