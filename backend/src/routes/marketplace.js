import { Router } from 'express'
import { authUser } from '../middlewares/authUser.js'
import {
  createMarketplaceTag,
  getMarketplaceTemplateDetail,
  installTemplateToUser,
  listMarketplaceTagOptions,
  listMarketplaceTemplates,
  publishFromAgent,
  removeMarketplaceTag,
  updateMarketplaceTagName,
} from '../services/marketplaceService.js'
import {
  getWorkflowMarketplaceTemplateDetail,
  installWorkflowTemplateToUser,
  listWorkflowMarketplaceTemplates,
  publishFromWorkflow,
} from '../services/workflowMarketplaceService.js'
import { ImageBuildInProgressError } from '../services/hermes.js'

const router = Router()

router.get('/agents', (_req, res) => {
  const tags = String(_req.query.tags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  res.json(listMarketplaceTemplates({ tagIds: tags }))
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
      tags: body.tags,
    })
    res.status(201).json(result)
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'publish_failed' })
    }
    res.status(500).json({ error: err?.message || 'publish_failed' })
  }
})

router.get('/tags', (_req, res) => {
  res.json(listMarketplaceTagOptions())
})

router.post('/tags', authUser, (req, res) => {
  try {
    const body = req.body || {}
    const created = createMarketplaceTag({ name: body.name })
    res.status(201).json(created)
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'tag_create_failed' })
    }
    res.status(500).json({ error: err?.message || 'tag_create_failed' })
  }
})

router.patch('/tags/:id', authUser, (req, res) => {
  try {
    const body = req.body || {}
    const updated = updateMarketplaceTagName({
      tagId: req.params.id,
      name: body.name,
    })
    res.json(updated)
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'tag_update_failed' })
    }
    res.status(500).json({ error: err?.message || 'tag_update_failed' })
  }
})

router.delete('/tags/:id', authUser, (req, res) => {
  try {
    removeMarketplaceTag(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'tag_delete_failed' })
    }
    res.status(500).json({ error: err?.message || 'tag_delete_failed' })
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

router.get('/workflows', (_req, res) => {
  const tags = String(_req.query.tags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  res.json(listWorkflowMarketplaceTemplates({ tagIds: tags }))
})

router.get('/workflows/:id', (req, res) => {
  const detail = getWorkflowMarketplaceTemplateDetail(req.params.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  res.json(detail)
})

router.post('/workflows', authUser, async (req, res) => {
  try {
    const body = req.body || {}
    const workflowId = String(body.workflowId || '').trim()
    if (!workflowId) return res.status(400).json({ error: 'workflowId is required' })
    const result = await publishFromWorkflow({
      workflowId,
      userId: req.user.id,
      title: body.title,
      description: body.description,
      tags: body.tags,
    })
    res.status(201).json(result)
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message || 'publish_failed' })
    }
    res.status(500).json({ error: err?.message || 'publish_failed' })
  }
})

router.post('/workflows/:id/install', authUser, async (req, res) => {
  try {
    const result = await installWorkflowTemplateToUser({
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
