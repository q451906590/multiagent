import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import {
  listAgents,
  getAgent,
  insertAgent,
  updateAgentRow,
  deleteAgentRow,
  hasActiveDelegationKeyForAgent,
} from '../db.js'
import {
  ensureHermesImage,
  ImageBuildInProgressError,
  createAgentContainer,
  stopAndRemoveContainer,
  removeVolume,
  containerNameFor,
  volumeNameFor,
} from '../services/hermes.js'
import {
  writeAgentProfile,
  writeHermesConfig,
  writeHermesEnvFile,
  readHermesConfig,
  readHermesEnv,
  writeHermesConfigRaw,
  writeHermesEnvRaw,
  configureAgentRuntime,
  buildAgentProfileMarkdown,
} from '../services/promptFile.js'
import { logger } from '../utils/logger.js'

const router = Router()

function normalizeHostMountPath(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (raw.includes('\0')) throw new Error('hostMountPath contains invalid null byte')
  if (!path.isAbsolute(raw)) throw new Error('hostMountPath must be an absolute path')
  return path.resolve(raw)
}

function publicAgent(a) {
  if (!a) return null
  return {
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    role: a.role,
    systemPrompt: a.systemPrompt,
    agentsMd: a.agentsMd || '',
    agentsMdResolved: buildAgentProfileMarkdown(a),
    model: a.model,
    hostMountPath: a.hostMountPath || '',
    createdAt: a.createdAt,
    messages: [],
    delegationEligible: hasActiveDelegationKeyForAgent(a.id),
  }
}

router.get('/', (req, res) => {
  res.json(listAgents(req.user.id).map(publicAgent))
})

router.get('/:id', (req, res) => {
  const a = getAgent(req.params.id, req.user.id)
  if (!a) return res.status(404).json({ error: 'not_found' })
  res.json(publicAgent(a))
})

router.post('/', async (req, res) => {
  const body = req.body || {}
  const name = String(body.name || '').trim() || '未命名 Agent'
  const emoji = String(body.emoji || '').trim() || '🤖'
  const role = String(body.role || '').trim()
  const systemPrompt = String(body.systemPrompt || '').trim()
  const agentsMd = typeof body.agentsMd === 'string' ? body.agentsMd.replace(/\r\n/g, '\n') : ''
  const model = String(body.model || '').trim() || config.hermesDefaultModel
  let hostMountPath = ''

  if (!systemPrompt) {
    return res.status(400).json({ error: 'systemPrompt is required' })
  }
  try {
    hostMountPath = normalizeHostMountPath(body.hostMountPath)
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'hostMountPath is invalid' })
  }
  if (hostMountPath) {
    try {
      await fs.mkdir(hostMountPath, { recursive: true })
    } catch (err) {
      return res.status(400).json({
        error: `failed to prepare hostMountPath: ${err?.message || String(err)}`,
      })
    }
  }

  const id = randomUUID()
  const agent = {
    id,
    userId: req.user.id,
    name,
    emoji,
    role,
    systemPrompt,
    agentsMd,
    model,
    containerId: null,
    hostMountPath,
    volumeName: volumeNameFor(id),
    createdAt: Date.now(),
  }

  try {
    await ensureHermesImage({
      onLog: (s) => logger.info('[image]', s.trimEnd()),
      waitIfBuilding: false,
    })
    const container = await createAgentContainer({ agentId: id, hostMountPath })
    agent.containerId = container.id

    insertAgent(agent)

    try {
      await configureAgentRuntime(id, agent)
    } catch (err) {
      logger.warn('configureAgentRuntime failed:', err?.message || err)
    }

    res.status(201).json(publicAgent(agent))
  } catch (err) {
    if (err instanceof ImageBuildInProgressError || err?.code === 'IMAGE_BUILD_IN_PROGRESS') {
      return res.status(409).json({
        error: 'image_build_in_progress',
        message: 'Hermes 镜像正在构建中，请等待构建完成后重试创建 Agent。',
      })
    }
    const errMsg = err?.message || String(err)
    if (errMsg.includes('docker pull') || errMsg.includes('failed to solve') || errMsg.includes('403 Forbidden')) {
      return res.status(503).json({
        error: 'image_pull_failed',
        message: 'Hermes 官方镜像拉取失败，请检查 Docker 镜像源或网络设置后重试。',
        detail: errMsg,
      })
    }
    logger.error('create agent failed:', err?.stack || err)
    try { await stopAndRemoveContainer(containerNameFor(id)) } catch (_) {}
    try { await removeVolume(volumeNameFor(id)) } catch (_) {}
    res.status(500).json({ error: errMsg || 'create_failed' })
  }
})

router.patch('/:id', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })

  const body = req.body || {}
  const updates = {}
  for (const k of ['name', 'emoji', 'role', 'systemPrompt', 'model']) {
    if (typeof body[k] === 'string') updates[k] = body[k].trim()
  }
  if (typeof body.agentsMd === 'string') {
    const value = body.agentsMd.replace(/\r\n/g, '\n')
    updates.agentsMd = value.trim() ? value : ''
  }

  if (updates.systemPrompt === '') {
    return res.status(400).json({ error: 'systemPrompt cannot be empty' })
  }

  try {
    updateAgentRow(id, updates, req.user.id)
    const merged = { ...existing, ...updates }

    if (
      typeof updates.systemPrompt === 'string' ||
      typeof updates.role === 'string' ||
      typeof updates.name === 'string' ||
      typeof updates.agentsMd === 'string'
    ) {
      try { await writeAgentProfile(id, merged) } catch (err) {
        logger.warn('writeAgentProfile (update) failed:', err?.message || err)
      }
    }
    if (typeof updates.model === 'string' && updates.model) {
      try {
        await writeHermesEnvFile(id, { model: updates.model })
        await writeHermesConfig(id, { model: updates.model })
      } catch (err) {
        logger.warn('writeHermesConfig/writeHermesEnvFile (update) failed:', err?.message || err)
      }
    }

    res.json(publicAgent(merged))
  } catch (err) {
    logger.error('update agent failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'update_failed' })
  }
})

router.get('/:id/hermes-config', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  try {
    const content = await readHermesConfig(id)
    res.json({ content })
  } catch (err) {
    logger.error('read hermes config failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'read_hermes_config_failed' })
  }
})

router.patch('/:id/hermes-config', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const body = req.body || {}
  if (typeof body.content !== 'string') {
    return res.status(400).json({ error: 'content is required' })
  }
  const content = body.content.replace(/\r\n/g, '\n')
  if (content.length > 200_000) {
    return res.status(400).json({ error: 'content too large' })
  }
  try {
    await writeHermesConfigRaw(id, content)
    res.json({ ok: true })
  } catch (err) {
    logger.error('write hermes config failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'write_hermes_config_failed' })
  }
})

router.get('/:id/hermes-env', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  try {
    let content = await readHermesEnv(id)
    if (!content.trim()) {
      try {
        await writeHermesEnvFile(id, { model: existing.model })
        content = await readHermesEnv(id)
      } catch (refreshErr) {
        logger.warn('refresh empty hermes env failed:', refreshErr?.message || refreshErr)
      }
    }
    res.json({ content })
  } catch (err) {
    logger.error('read hermes env failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'read_hermes_env_failed' })
  }
})

router.patch('/:id/hermes-env', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })
  const body = req.body || {}
  if (typeof body.content !== 'string') {
    return res.status(400).json({ error: 'content is required' })
  }
  const content = body.content.replace(/\r\n/g, '\n')
  if (content.length > 200_000) {
    return res.status(400).json({ error: 'content too large' })
  }
  try {
    await writeHermesEnvRaw(id, content)
    res.json({ ok: true })
  } catch (err) {
    logger.error('write hermes env failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'write_hermes_env_failed' })
  }
})

router.delete('/:id', async (req, res) => {
  const id = req.params.id
  const existing = getAgent(id, req.user.id)
  if (!existing) return res.status(404).json({ error: 'not_found' })

  try {
    await stopAndRemoveContainer(containerNameFor(id)).catch((err) =>
      logger.warn('stopAndRemoveContainer failed:', err?.message || err)
    )
    await removeVolume(volumeNameFor(id)).catch((err) =>
      logger.warn('removeVolume failed:', err?.message || err)
    )
    deleteAgentRow(id, req.user.id)
    res.json({ ok: true })
  } catch (err) {
    logger.error('delete agent failed:', err?.stack || err)
    res.status(500).json({ error: err?.message || 'delete_failed' })
  }
})

export default router
