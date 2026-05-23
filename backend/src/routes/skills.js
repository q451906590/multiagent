import { Router } from 'express'
import { getAgent } from '../db.js'
import { deleteSkill, installSkill, listSkills } from '../services/skillsService.js'

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
    const items = await listSkills(agentId)
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'skills_list_failed', message: err?.message || String(err) })
  }
})

router.post('/install', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const installed = await installSkill(agentId, req.body || {})
    res.status(201).json(installed)
  } catch (err) {
    res.status(400).json({ error: 'skills_install_failed', message: err?.message || String(err) })
  }
})

router.delete('/:skillId', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  try {
    const ok = await deleteSkill(agentId, req.params.skillId)
    if (!ok) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'skills_delete_failed', message: err?.message || String(err) })
  }
})

export default router
