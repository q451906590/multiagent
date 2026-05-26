import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  bumpAgentTemplateInstallCount,
  getAgent,
  getAgentTemplateById,
  getAgentTemplateBySourceAgent,
  insertAgent,
  insertAgentInstallation,
  insertAgentTemplate,
  listPublicAgentTemplates,
  updateAgentTemplate,
} from '../db.js'
import {
  ImageBuildInProgressError,
  createAgentContainer,
  ensureHermesImage,
  volumeNameFor,
} from './hermes.js'
import { buildAgentProfileMarkdown } from './promptFile.js'
import {
  buildTemplateSnapshot,
  cloneRuntimeDirsBetweenAgents,
  sanitizeHermesEnv,
  writeSnapshotCoreFiles,
} from './agentSnapshotService.js'
import { logger } from '../utils/logger.js'

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function templateVersion(template) {
  const ts = Number(template.updatedAt || template.createdAt || Date.now())
  return `v${ts}`
}

function templatePublicItem(template) {
  return {
    id: template.id,
    title: template.title,
    slug: template.slug,
    description: template.description,
    emoji: template.emoji,
    role: template.role,
    model: template.model,
    installCount: template.installCount,
    publisherUsername: template.publisherUsername || '',
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

function templatePublicDetail(template) {
  const envSnapshot = sanitizeHermesEnv(template?.hermesEnvSanitized || '')
  const storedMissingKeys = Array.isArray(template?.hermesMissingKeys)
    ? template.hermesMissingKeys.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const mergedMissingKeys = [...new Set([...envSnapshot.missingKeys, ...storedMissingKeys])]
  const normalizedEnvContent = mergedMissingKeys.length > 0
    ? `${mergedMissingKeys.map((key) => `${key}=`).join('\n')}\n`
    : ''
  return {
    ...templatePublicItem(template),
    systemPrompt: template.systemPrompt,
    agentsMd: template.agentsMd,
    hermesConfig: template.hermesConfig,
    hermesEnvSanitized: normalizedEnvContent,
    hermesMissingKeys: mergedMissingKeys,
    mcpList: template.mcpList,
    skillsList: template.skillsList,
  }
}

export function listMarketplaceTemplates() {
  return listPublicAgentTemplates().map(templatePublicItem)
}

export function getMarketplaceTemplateDetail(templateId) {
  const template = getAgentTemplateById(templateId)
  if (!template || template.status !== 'published' || template.visibility !== 'public') {
    return null
  }
  return templatePublicDetail(template)
}

export async function publishFromAgent({ agentId, userId, title, description }) {
  const source = getAgent(agentId, userId)
  if (!source) {
    const err = new Error('agent_not_found')
    err.status = 404
    throw err
  }
  if (source.sourceTemplateId) {
    const err = new Error('marketplace_import_cannot_republish')
    err.status = 400
    throw err
  }
  const snapshot = await buildTemplateSnapshot(source.id)
  const now = Date.now()
  const nextTitle = String(title || '').trim() || source.name
  const nextDescription = String(description || '').trim()
  const baseSlug = slugify(nextTitle || source.name) || `agent-${source.id.slice(0, 8)}`
  const current = getAgentTemplateBySourceAgent(source.id, userId)

  if (current) {
    updateAgentTemplate(current.id, {
      title: nextTitle,
      description: nextDescription,
      emoji: source.emoji || '',
      role: source.role || '',
      systemPrompt: source.systemPrompt,
      agentsMd: source.agentsMd || '',
      model: source.model || config.hermesDefaultModel,
      hermesConfig: snapshot.hermesConfig,
      hermesEnvSanitized: snapshot.hermesEnvSanitized,
      hermesMissingKeys: snapshot.hermesMissingKeys,
      mcpList: snapshot.mcpList,
      skillsList: snapshot.skillsList,
      visibility: 'public',
      status: 'published',
      updatedAt: now,
    }, userId)
    const updated = getAgentTemplateById(current.id)
    return templatePublicDetail(updated)
  }

  const template = {
    id: randomUUID(),
    publisherUserId: userId,
    sourceAgentId: source.id,
    title: nextTitle,
    slug: `${baseSlug}-${source.id.slice(0, 6)}`,
    description: nextDescription,
    emoji: source.emoji || '',
    role: source.role || '',
    systemPrompt: source.systemPrompt,
    agentsMd: source.agentsMd || '',
    model: source.model || config.hermesDefaultModel,
    hermesConfig: snapshot.hermesConfig,
    hermesEnvSanitized: snapshot.hermesEnvSanitized,
    hermesMissingKeys: snapshot.hermesMissingKeys,
    mcpList: snapshot.mcpList,
    skillsList: snapshot.skillsList,
    visibility: 'public',
    status: 'published',
    installCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  insertAgentTemplate(template)
  return templatePublicDetail(template)
}

export async function installTemplateToUser({ templateId, userId }) {
  const template = getAgentTemplateById(templateId)
  if (!template || template.status !== 'published' || template.visibility !== 'public') {
    const err = new Error('template_not_found')
    err.status = 404
    throw err
  }

  const sourceAgent = getAgent(template.sourceAgentId, template.publisherUserId)
  if (!sourceAgent) {
    const err = new Error('template_source_not_found')
    err.status = 409
    throw err
  }

  const newAgentId = randomUUID()
  const newAgent = {
    id: newAgentId,
    userId,
    name: template.title,
    emoji: template.emoji || '🤖',
    role: template.role || '',
    systemPrompt: template.systemPrompt,
    agentsMd: template.agentsMd || '',
    model: template.model || config.hermesDefaultModel,
    containerId: null,
    hostMountPath: '',
    volumeName: volumeNameFor(newAgentId),
    sourceTemplateId: template.id,
    sourceTemplateVersion: templateVersion(template),
    createdAt: Date.now(),
  }

  await ensureHermesImage({
    onLog: (s) => logger.info('[image]', s.trimEnd()),
    waitIfBuilding: false,
  }).catch((err) => {
    if (err instanceof ImageBuildInProgressError || err?.code === 'IMAGE_BUILD_IN_PROGRESS') {
      throw err
    }
    throw err
  })

  const container = await createAgentContainer({ agentId: newAgentId })
  newAgent.containerId = container.id
  insertAgent(newAgent)

  await cloneRuntimeDirsBetweenAgents({
    fromAgentId: sourceAgent.id,
    toAgentId: newAgent.id,
  })
  const envSnapshot = sanitizeHermesEnv(template?.hermesEnvSanitized || '')
  const storedMissingKeys = Array.isArray(template?.hermesMissingKeys)
    ? template.hermesMissingKeys.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const mergedMissingKeys = [...new Set([...envSnapshot.missingKeys, ...storedMissingKeys])]
  const normalizedEnvContent = mergedMissingKeys.length > 0
    ? `${mergedMissingKeys.map((key) => `${key}=`).join('\n')}\n`
    : ''
  await writeSnapshotCoreFiles({
    toAgentId: newAgent.id,
    agentsMd: buildAgentProfileMarkdown(newAgent),
    hermesConfig: template.hermesConfig,
    hermesEnvSanitized: normalizedEnvContent,
  })

  insertAgentInstallation({
    id: randomUUID(),
    templateId: template.id,
    userId,
    agentId: newAgent.id,
    installedVersion: templateVersion(template),
    createdAt: Date.now(),
  })
  bumpAgentTemplateInstallCount(template.id)
  return {
    agentId: newAgent.id,
    templateId: template.id,
    hermesMissingKeys: mergedMissingKeys,
  }
}
