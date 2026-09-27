// Live web search for the AI, via Tavily (built for feeding LLM agents —
// returns cleaned page content and an optional synthesized answer, not just
// a raw one-line snippet like a plain Google API would).
export async function tavilySearch(query, { maxResults = 5, includeAnswer = true } = {}) {
  const apiKey = process.env.TAVILY_API_KEY?.trim()
  if (!apiKey) throw new Error('Web search is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let response
  try {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(Math.max(Number(maxResults) || 5, 1), 10),
        include_answer: includeAnswer,
        search_depth: 'basic',
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Web search timed out')
    throw new Error(`Web search failed: ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || data?.detail || `Web search failed (${response.status})`)

  return {
    answer: data.answer || null,
    results: (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: typeof r.content === 'string' ? r.content.slice(0, 1200) : '',
      score: r.score,
    })),
  }
}
