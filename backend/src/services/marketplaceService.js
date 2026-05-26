import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  bumpAgentTemplateInstallCount,
  getAgent,
  getAgentTemplateById,
  getAgentTemplateBySourceAgent,
  getMarketplaceTagById,
  getMarketplaceTagByName,
  insertAgent,
  insertAgentInstallation,
  insertMarketplaceTag,
  insertAgentTemplate,
  listMarketplaceTags,
  listPublicAgentTemplates,
  updateMarketplaceTag,
  updateAgentTemplate,
  deleteMarketplaceTag,
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
  const tags = Array.isArray(template.tags) ? template.tags : []
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
    tags,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

function withResolvedTags(template) {
  if (!template) return template
  const tagMap = new Map(listMarketplaceTags().map((tag) => [tag.id, tag]))
  return {
    ...template,
    tags: (template.tagIds || [])
      .map((tagId) => tagMap.get(tagId))
      .filter(Boolean),
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

export function listMarketplaceTemplates({ tagIds = [] } = {}) {
  const filterTagIds = normalizeTagInput(tagIds)
  const tags = listMarketplaceTags()
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  return listPublicAgentTemplates()
    .map((template) => ({
      ...template,
      tags: (template.tagIds || [])
        .map((tagId) => tagMap.get(tagId))
        .filter(Boolean),
    }))
    .filter((template) => {
      if (filterTagIds.length === 0) return true
      const templateTagIds = (template.tags || []).map((tag) => tag.id)
      return filterTagIds.every((tagId) => templateTagIds.includes(tagId))
    })
    .map(templatePublicItem)
}

export function getMarketplaceTemplateDetail(templateId) {
  const tags = listMarketplaceTags()
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  const template = getAgentTemplateById(templateId)
  if (!template || template.status !== 'published' || template.visibility !== 'public') {
    return null
  }
  const detail = {
    ...template,
    tags: (template.tagIds || [])
      .map((tagId) => tagMap.get(tagId))
      .filter(Boolean),
  }
  return templatePublicDetail(detail)
}

function normalizeTagInput(tags) {
  if (!Array.isArray(tags)) return []
  return [...new Set(tags.map((item) => String(item || '').trim()).filter(Boolean))]
}

function resolveTagIds(tags) {
  const ids = []
  for (const tag of normalizeTagInput(tags)) {
    const byId = getMarketplaceTagById(tag)
    if (byId) {
      ids.push(byId.id)
      continue
    }
    const byName = getMarketplaceTagByName(tag)
    if (byName) ids.push(byName.id)
  }
  return [...new Set(ids)]
}

export function listMarketplaceTagOptions() {
  return listMarketplaceTags()
}

export function createMarketplaceTag({ name }) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24)
  if (!normalized) {
    const err = new Error('tag_name_required')
    err.status = 400
    throw err
  }
  if (getMarketplaceTagByName(normalized)) {
    const err = new Error('tag_name_duplicated')
    err.status = 409
    throw err
  }
  const now = Date.now()
  const created = {
    id: randomUUID(),
    name: normalized,
    createdAt: now,
    updatedAt: now,
  }
  insertMarketplaceTag(created)
  return created
}

export function updateMarketplaceTagName({ tagId, name }) {
  const existing = getMarketplaceTagById(tagId)
  if (!existing) {
    const err = new Error('tag_not_found')
    err.status = 404
    throw err
  }
  const normalized = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24)
  if (!normalized) {
    const err = new Error('tag_name_required')
    err.status = 400
    throw err
  }
  const duplicate = getMarketplaceTagByName(normalized)
  if (duplicate && duplicate.id !== existing.id) {
    const err = new Error('tag_name_duplicated')
    err.status = 409
    throw err
  }
  updateMarketplaceTag(existing.id, {
    name: normalized,
    updatedAt: Date.now(),
  })
  return getMarketplaceTagById(existing.id)
}

export function removeMarketplaceTag(tagId) {
  const existing = getMarketplaceTagById(tagId)
  if (!existing) {
    const err = new Error('tag_not_found')
    err.status = 404
    throw err
  }
  const now = Date.now()
  const templates = listPublicAgentTemplates()
  for (const template of templates) {
    if (!Array.isArray(template.tagIds) || template.tagIds.length === 0) continue
    const nextTagIds = template.tagIds.filter((id) => id !== tagId)
    if (nextTagIds.length === template.tagIds.length) continue
    updateAgentTemplate(template.id, { tagIds: nextTagIds, updatedAt: now }, template.publisherUserId)
  }
  deleteMarketplaceTag(tagId)
}

export async function publishFromAgent({ agentId, userId, title, description, tags }) {
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
  const nextTagIds = resolveTagIds(tags)
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
      tagIds: nextTagIds,
      visibility: 'public',
      status: 'published',
      updatedAt: now,
    }, userId)
    const updated = withResolvedTags(getAgentTemplateById(current.id))
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
    tagIds: nextTagIds,
    visibility: 'public',
    status: 'published',
    installCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  insertAgentTemplate(template)
  return templatePublicDetail(withResolvedTags(template))
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
