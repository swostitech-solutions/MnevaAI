import express from 'express'

const router = express.Router()
const TMDB_KEY = process.env.TMDB_API_KEY
const BASE = 'https://api.themoviedb.org/3'

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ api_key: TMDB_KEY, language: 'en-US', ...params }).toString()
  const res = await fetch(`${BASE}${path}?${qs}`)
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

// GET /api/tmdb/trending?window=week
router.get('/trending', async (req, res) => {
  try {
    const data = await tmdb(`/trending/movie/${req.query.window || 'week'}`)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/tmdb/discover?genre_id=28&lang=hi
router.get('/discover', async (req, res) => {
  try {
    const { genre_id, lang, sort_by = 'popularity.desc', page = 1 } = req.query
    const params = { sort_by, page }
    if (genre_id) params.with_genres = genre_id
    if (lang) params.with_original_language = lang
    const data = await tmdb('/discover/movie', params)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/tmdb/search?query=Pathaan&type=movie
router.get('/search', async (req, res) => {
  try {
    const { query, type = 'movie' } = req.query
    if (!query) return res.status(400).json({ error: 'query required' })
    const data = await tmdb(`/search/${type}`, { query })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/tmdb/movie/:id
router.get('/movie/:id', async (req, res) => {
  try {
    const [details, credits, videos] = await Promise.all([
      tmdb(`/movie/${req.params.id}`),
      tmdb(`/movie/${req.params.id}/credits`),
      tmdb(`/movie/${req.params.id}/videos`),
    ])
    res.json({ ...details, credits, videos })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/tmdb/genres
router.get('/genres', async (req, res) => {
  try {
    const data = await tmdb('/genre/movie/list')
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/tmdb/tv?lang=hi&page=1
router.get('/tv', async (req, res) => {
  try {
    const { lang, page = 1 } = req.query
    const params = { sort_by: 'popularity.desc', page }
    if (lang) params.with_original_language = lang
    const data = await tmdb('/discover/tv', params)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
