import { Router } from 'express'
import { listAgents, updateAgentRow } from '../db.js'
import {
  ensureHermesImage,
  findContainer,
  createAgentContainer,
  pingDocker,
  getHermesImageBuildState,
  containerNameFor,
} from '../services/hermes.js'
import { configureAgentRuntime } from '../services/promptFile.js'
import { logger } from '../utils/logger.js'

const router = Router()

router.get('/health', async (_req, res) => {
  const ok = await pingDocker()
  res.json({ ok, docker: ok })
})

router.get('/image-build-status', (_req, res) => {
  res.json({ ok: true, state: getHermesImageBuildState() })
})

router.post('/bootstrap', async (req, res) => {
  const userId = req.user.id
  const agents = listAgents(userId)
  const results = []

  try {
    await ensureHermesImage({ onLog: (s) => logger.info('[image]', s.trimEnd()) })
  } catch (err) {
    logger.error('ensureHermesImage failed:', err?.stack || err)
    return res.status(500).json({
      error: 'image_pull_failed',
      message: 'Hermes 官方镜像拉取失败，请检查 Docker 镜像源或网络设置后重试。',
      detail: err?.message || String(err),
      state: getHermesImageBuildState(),
    })
  }

  for (const a of agents) {
    const name = containerNameFor(a.id)
    try {
      const c = await findContainer(name)
      if (!c) {
        const created = await createAgentContainer({
          agentId: a.id,
          hostMountPath: a.hostMountPath,
        })
        updateAgentRow(a.id, { containerId: created.id }, userId)
        try { await configureAgentRuntime(a.id, a) } catch (err) {
          logger.warn('[bootstrap] configureAgentRuntime failed:', err?.message || err)
        }
        results.push({ id: a.id, status: 'recreated' })
        continue
      }
      const info = await c.inspect()
      if (info.State?.Running) {
        results.push({ id: a.id, status: 'running' })
      } else {
        await c.start()
        try { await configureAgentRuntime(a.id, a) } catch (err) {
          logger.warn('[bootstrap] configureAgentRuntime (refresh) failed:', err?.message || err)
        }
        results.push({ id: a.id, status: 'started' })
      }
    } catch (err) {
      logger.error(`[bootstrap] agent ${a.id} failed:`, err?.stack || err)
      results.push({ id: a.id, status: 'failed', error: err?.message || String(err) })
    }
  }

  res.json({ ok: true, count: results.length, results })
})

export default router
