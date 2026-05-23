import { Router } from 'express'
import { getAgent } from '../db.js'
import {
  createMcp,
  deleteMcp,
  installMcp,
  listMcp,
  uninstallMcp,
  updateMcp,
} from '../services/mcpService.js'

const router = Router({ mergeParams: true })

function ensureAgent(req, res) {
  const agentId = req.params.id
  const agent = getAgent(agentId, req.user.id)
  if (!agent) {
    res.status(404).json({ error: 'agent_not_found' })
    return null
  }
  return agentId
}

router.get('/', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const items = await listMcp(agentId)
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'mcp_list_failed', message: err?.message || String(err) })
  }
})

router.post('/', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const created = await createMcp(agentId, req.body || {})
    res.status(201).json(created)
  } catch (err) {
    res.status(400).json({ error: 'mcp_create_failed', message: err?.message || String(err) })
  }
})

router.patch('/:mcpId', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const updated = await updateMcp(agentId, req.params.mcpId, req.body || {})
    if (!updated) return res.status(404).json({ error: 'not_found' })
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: 'mcp_update_failed', message: err?.message || String(err) })
  }
})

router.delete('/:mcpId', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const ok = await deleteMcp(agentId, req.params.mcpId)
    if (!ok) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'mcp_delete_failed', message: err?.message || String(err) })
  }
})

router.post('/:mcpId/install', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const item = await installMcp(agentId, req.params.mcpId)
    if (!item) return res.status(404).json({ error: 'not_found' })
    res.json(item)
  } catch (err) {
    res.status(400).json({ error: 'mcp_install_failed', message: err?.message || String(err) })
  }
})

router.post('/:mcpId/uninstall', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const item = await uninstallMcp(agentId, req.params.mcpId)
    if (!item) return res.status(404).json({ error: 'not_found' })
    res.json(item)
  } catch (err) {
    res.status(400).json({ error: 'mcp_uninstall_failed', message: err?.message || String(err) })
  }
})

export default router
