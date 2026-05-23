import { Router } from 'express'
import { authUser } from '../middlewares/authUser.js'
import {
  getMarketplaceTemplateDetail,
  installTemplateToUser,
  listMarketplaceTemplates,
  publishFromAgent,
} from '../services/marketplaceService.js'
import { ImageBuildInProgressError } from '../services/hermes.js'

const router = Router()

router.get('/agents', (_req, res) => {
  res.json(listMarketplaceTemplates())
})

router.get('/agents/:id', (req, res) => {
  const detail = getMarketplaceTemplateDetail(req.params.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  res.json(detail)
})

router.post('/agents', authUser, async (req, res) => {
  try {
    const body = req.body || {}
    const agentId = String(body.agentId || '').trim()
    if (!agentId) return res.status(400).json({ error: 'agentId is required' })
    const result = await publishFromAgent({
      agentId,
      userId: req.user.id,
      title: body.title,
      description: body.description,
    })
    res.status(201).json(result)
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'publish_failed' })
    }
    res.status(500).json({ error: err?.message || 'publish_failed' })
  }
})

router.post('/agents/:id/install', authUser, async (req, res) => {
  try {
    const result = await installTemplateToUser({
      templateId: req.params.id,
      userId: req.user.id,
    })
    res.status(201).json(result)
  } catch (err) {
    if (err instanceof ImageBuildInProgressError || err?.code === 'IMAGE_BUILD_IN_PROGRESS') {
      return res.status(409).json({ error: 'image_build_in_progress' })
    }
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'install_failed' })
    }
    res.status(500).json({ error: err?.message || 'install_failed' })
  }
})

export default router
