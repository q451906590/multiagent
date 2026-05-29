import { randomUUID } from 'node:crypto'
import {
  bumpWorkflowTemplateInstallCount,
  getMarketplaceTagById,
  getMarketplaceTagByName,
  getWorkflowById,
  getWorkflowTemplateById,
  getWorkflowTemplateBySourceWorkflow,
  insertWorkflow,
  insertWorkflowInstallation,
  insertWorkflowTemplate,
  listMarketplaceTags,
  listPublicWorkflowTemplates,
  updateWorkflowTemplate,
} from '../db.js'
import { installTemplateToUser, publishFromAgent } from './marketplaceService.js'
import { sanitizeCanvasForMarketplace } from './workflowService.js'

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
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

function workflowTemplateVersion(template) {
  const ts = Number(template.updatedAt || template.createdAt || Date.now())
  return `v${ts}`
}

function workflowTemplatePublicItem(template) {
  const canvas = template?.canvasDefinition && typeof template.canvasDefinition === 'object'
    ? template.canvasDefinition
    : { nodes: [], edges: [] }
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : []
  const edges = Array.isArray(canvas.edges) ? canvas.edges : []
  return {
    id: template.id,
    title: template.title,
    slug: template.slug,
    description: template.description,
    installCount: template.installCount,
    publisherUsername: template.publisherUsername || '',
    tags: Array.isArray(template.tags) ? template.tags : [],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    dependencyCount: Array.isArray(template.agentDependencies) ? template.agentDependencies.length : 0,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

function workflowTemplatePublicDetail(template) {
  return {
    ...workflowTemplatePublicItem(template),
    canvasDefinition: template.canvasDefinition || { nodes: [], edges: [] },
    agentDependencies: Array.isArray(template.agentDependencies) ? template.agentDependencies : [],
  }
}

function extractAgentNodeEntries(nodes) {
  const list = Array.isArray(nodes) ? nodes : []
  return list
    .map((node) => {
      const type = String(node?.type || '').trim()
      if (type !== 'agent' && type !== 'agent.chat') return null
      const agentId = String(node?.data?.agentId || '').trim()
      if (!agentId) return null
      return {
        nodeId: String(node?.id || '').trim(),
        nodeLabel: String(node?.label || node?.data?.label || '').trim(),
        agentId,
      }
    })
    .filter(Boolean)
}

function attachDependencyHintsToCanvas(canvasDefinition, depMap) {
  const next = JSON.parse(JSON.stringify(canvasDefinition || { nodes: [], edges: [] }))
  const nodes = Array.isArray(next.nodes) ? next.nodes : []
  for (const node of nodes) {
    const type = String(node?.type || '').trim()
    if (type !== 'agent' && type !== 'agent.chat') continue
    const data = node?.data && typeof node.data === 'object' ? { ...node.data } : {}
    const sourceAgentId = String(data.agentId || '').trim()
    const dep = depMap.get(sourceAgentId)
    data.agentTemplateId = dep?.templateId || ''
    data.agentId = ''
    node.data = data
  }
  return next
}

export function listWorkflowMarketplaceTemplates({ tagIds = [] } = {}) {
  const filterTagIds = normalizeTagInput(tagIds)
  const tags = listMarketplaceTags()
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  return listPublicWorkflowTemplates()
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
    .map(workflowTemplatePublicItem)
}

export function getWorkflowMarketplaceTemplateDetail(templateId) {
  const tags = listMarketplaceTags()
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  const template = getWorkflowTemplateById(templateId)
  if (!template || template.status !== 'published' || template.visibility !== 'public') {
    return null
  }
  const detail = {
    ...template,
    tags: (template.tagIds || [])
      .map((tagId) => tagMap.get(tagId))
      .filter(Boolean),
  }
  return workflowTemplatePublicDetail(detail)
}

export async function publishFromWorkflow({ workflowId, userId, title, description, tags }) {
  const source = getWorkflowById(workflowId, userId)
  if (!source) {
    const err = new Error('workflow_not_found')
    err.status = 404
    throw err
  }
  if (source.sourceTemplateId) {
    const err = new Error('marketplace_import_cannot_republish')
    err.status = 400
    throw err
  }
  const now = Date.now()
  const nextTitle = String(title || '').trim() || source.name
  const nextDescription = String(description || '').trim()
  const nextTagIds = resolveTagIds(tags)
  const agentEntries = extractAgentNodeEntries(source.canvasDefinition?.nodes)
  const deps = []
  const depMap = new Map()
  const handledAgentIds = new Set()
  for (const entry of agentEntries) {
    if (handledAgentIds.has(entry.agentId)) continue
    handledAgentIds.add(entry.agentId)
    const depTemplate = await publishFromAgent({
      agentId: entry.agentId,
      userId,
    })
    const dep = {
      sourceAgentId: entry.agentId,
      templateId: depTemplate.id,
      templateTitle: depTemplate.title,
    }
    deps.push(dep)
    depMap.set(entry.agentId, dep)
  }

  const sanitizedCanvas = sanitizeCanvasForMarketplace(source.canvasDefinition || { nodes: [], edges: [] })
  const canvasWithDeps = attachDependencyHintsToCanvas(sanitizedCanvas, depMap)
  const baseSlug = slugify(nextTitle || source.name) || `workflow-${source.id.slice(0, 8)}`
  const current = getWorkflowTemplateBySourceWorkflow(source.id, userId)
  if (current) {
    updateWorkflowTemplate(current.id, {
      title: nextTitle,
      description: nextDescription,
      canvasDefinition: canvasWithDeps,
      agentDependencies: deps,
      tagIds: nextTagIds,
      visibility: 'public',
      status: 'published',
      updatedAt: now,
    }, userId)
    return workflowTemplatePublicDetail(withResolvedTags(getWorkflowTemplateById(current.id)))
  }

  const template = {
    id: randomUUID(),
    publisherUserId: userId,
    sourceWorkflowId: source.id,
    title: nextTitle,
    slug: `${baseSlug}-${source.id.slice(0, 6)}`,
    description: nextDescription,
    canvasDefinition: canvasWithDeps,
    agentDependencies: deps,
    tagIds: nextTagIds,
    visibility: 'public',
    status: 'published',
    installCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  insertWorkflowTemplate(template)
  return workflowTemplatePublicDetail(withResolvedTags(template))
}

export async function installWorkflowTemplateToUser({ templateId, userId }) {
  const template = getWorkflowTemplateById(templateId)
  if (!template || template.status !== 'published' || template.visibility !== 'public') {
    const err = new Error('template_not_found')
    err.status = 404
    throw err
  }
  const templateDepList = Array.isArray(template.agentDependencies) ? template.agentDependencies : []
  const installMap = new Map()
  const installedAgents = []
  const missingAgents = []
  for (const dep of templateDepList) {
    const depTemplateId = String(dep?.templateId || '').trim()
    if (!depTemplateId || installMap.has(depTemplateId)) continue
    try {
      const result = await installTemplateToUser({ templateId: depTemplateId, userId })
      installMap.set(depTemplateId, result.agentId)
      installedAgents.push({
        templateId: depTemplateId,
        agentId: result.agentId,
      })
    } catch (err) {
      const message = String(err?.message || '')
      if (err?.status === 404 || message === 'template_not_found' || message === 'template_source_not_found') {
        missingAgents.push({
          templateId: depTemplateId,
          title: String(dep?.templateTitle || ''),
        })
        continue
      }
      throw err
    }
  }

  const canvas = JSON.parse(JSON.stringify(template.canvasDefinition || { nodes: [], edges: [] }))
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : []
  for (const node of nodes) {
    const type = String(node?.type || '').trim()
    if (type !== 'agent' && type !== 'agent.chat') continue
    const data = node?.data && typeof node.data === 'object' ? { ...node.data } : {}
    const depTemplateId = String(data.agentTemplateId || '').trim()
    data.agentId = installMap.get(depTemplateId) || ''
    node.data = data
  }

  const now = Date.now()
  const workflowId = `wf_${randomUUID()}`
  insertWorkflow({
    id: workflowId,
    userId,
    name: template.title,
    description: template.description || '',
    canvasDefinition: canvas,
    n8nDefinition: null,
    n8nWorkflowId: null,
    sourceTemplateId: template.id,
    sourceTemplateVersion: workflowTemplateVersion(template),
    publishStatus: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  insertWorkflowInstallation({
    id: randomUUID(),
    templateId: template.id,
    userId,
    workflowId,
    installedVersion: workflowTemplateVersion(template),
    createdAt: now,
  })
  bumpWorkflowTemplateInstallCount(template.id)

  return {
    templateId: template.id,
    workflowId,
    installedAgents,
    missingAgents,
  }
}
