import { logger } from '../config/logger.js'
export const errorHandler = (err, req, res, next) => {
  logger.error(`${err.status || 500} ${err.message} — ${req.method} ${req.originalUrl}`)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  })
}
