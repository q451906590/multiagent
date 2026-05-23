import { Router } from 'express'
import { authUser } from '../middlewares/authUser.js'
import { createAccessToken, loginUser, registerUser } from '../services/authService.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const user = await registerUser(req.body || {})
    const token = createAccessToken(user)
    res.status(201).json({ token, user })
  } catch (err) {
    const message = err?.message || 'register_failed'
    const status = message.includes('exists') || message.includes('length') || message.includes('required')
      ? 400
      : 500
    res.status(status).json({ error: message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const user = await loginUser(req.body || {})
    const token = createAccessToken(user)
    res.json({ token, user })
  } catch (err) {
    const message = err?.message || 'login_failed'
    const status = message === 'invalid username or password' ? 401 : 400
    res.status(status).json({ error: message })
  }
})

router.get('/me', authUser, (req, res) => {
  res.json(req.user)
})

export default router
