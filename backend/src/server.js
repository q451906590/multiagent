import express from 'express'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { getDb } from './db.js'
import agentsRouter from './routes/agents.js'
import chatRouter from './routes/chat.js'
import systemRouter from './routes/system.js'
import mcpRouter from './routes/mcp.js'
import skillsRouter from './routes/skills.js'
import filesRouter from './routes/files.js'
import delegationsRouter from './routes/delegations.js'
import authRouter from './routes/auth.js'
import { authUser } from './middlewares/authUser.js'

const app = express()

app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`)
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

app.use('/api/auth', authRouter)
app.use('/api/agents', authUser, agentsRouter)
app.use('/api/agents', authUser, chatRouter)
app.use('/api/agents/:id/mcp', authUser, mcpRouter)
app.use('/api/agents/:id/skills', authUser, skillsRouter)
app.use('/api/agents/:id/files', authUser, filesRouter)
app.use('/api/system', authUser, systemRouter)
app.use('/api', delegationsRouter)

app.use((err, _req, res, _next) => {
  logger.error('unhandled error:', err?.stack || err)
  if (res.headersSent) return
  res.status(500).json({ error: err?.message || 'internal_error' })
})

getDb()

app.listen(config.port, () => {
  logger.info(`backend listening on http://localhost:${config.port}`)
})
