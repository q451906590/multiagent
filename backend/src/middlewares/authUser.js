import { parseBearerToken } from '../services/delegationService.js'
import { getUserPublicById, verifyAccessToken } from '../services/authService.js'

function parseTokenFromQuery(req) {
  if (String(req.method || '').toUpperCase() !== 'GET') return ''
  return String(req.query?.token || '').trim()
}

export function authUser(req, res, next) {
  try {
    const bearer = parseBearerToken(req.headers?.authorization)
    const token = bearer || parseTokenFromQuery(req)
    if (!token) return res.status(401).json({ error: 'missing access token' })
    const payload = verifyAccessToken(token)
    const userId = String(payload?.sub || '').trim()
    if (!userId) return res.status(401).json({ error: 'invalid access token' })
    const user = getUserPublicById(userId)
    if (!user) return res.status(401).json({ error: 'user_not_found' })
    req.user = user
    next()
  } catch (err) {
    res.status(401).json({ error: err?.message || 'invalid access token' })
  }
}
