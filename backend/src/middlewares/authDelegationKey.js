import { parseBearerToken, verifyDelegationKey } from '../services/delegationService.js'

export function authDelegationKey(req, res, next) {
  try {
    const token = parseBearerToken(req.headers?.authorization)
    const key = verifyDelegationKey(token)
    req.delegationKey = key
    next()
  } catch (err) {
    res.status(401).json({ error: err?.message || 'invalid delegation key' })
  }
}
