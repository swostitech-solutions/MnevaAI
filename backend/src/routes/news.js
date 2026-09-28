import express from 'express'
import { getNewsStories } from '../services/newsFeed.js'

export const newsRouter = express.Router()

// POST /api/news/stories — { type: 'foryou'|'trending'|'discover'|'following', filter? }
newsRouter.post('/stories', async (req, res) => {
  try {
    const { type = 'foryou', filter } = req.body || {}
    // No followed topics yet — nothing to search for, and no point paying
    // for a model call that would just have to guess.
    if (type === 'following' && !String(filter || '').trim()) {
      return res.json({ stories: [] })
    }
    const result = await getNewsStories(type, filter)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
