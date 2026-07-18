import jwt from 'jsonwebtoken'
export const authMiddleware = (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' })
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET environment variable is not set')
    const decoded = jwt.verify(h.split(' ')[1], secret)
    req.user = { ...decoded, id: decoded.id || decoded.userId }
    next()
  } catch { res.status(401).json({ error: 'Invalid or expired token' }) }
}
