import crypto from 'node:crypto'
import {
  deleteWorkflow,
  getWorkflowById,
  insertWorkflow,
  listWorkflowsByUser,
  updateWorkflow,
} from '../db.js'
import { config } from '../config.js'
import { deleteN8nWorkflow, setN8nWorkflowActive, upsertN8nWorkflow } from './n8nService.js'

function now() {
  return Date.now()
}

function newWorkflowId() {
  return `wf_${crypto.randomUUID()}`
}

function normalizeCanvasDefinition(input) {
  const value = input && typeof input === 'object' ? input : {}
  const nodes = Array.isArray(value.nodes) ? value.nodes : []
  const edges = Array.isArray(value.edges) ? value.edges : []
  return { nodes, edges }
}

function normalizeBasicFields(payload) {
  const name = String(payload?.name || '').trim()
  if (!name) throw new Error('workflow name is required')
  if (name.length > 80) throw new Error('workflow name should be <= 80 characters')
  const description = String(payload?.description || '').trim().slice(0, 500)
  return { name, description }
}

function toN8nNode(node) {
  const nodeId = String(node?.id || crypto.randomUUID())
  const nodeType = String(node?.type || '').trim()
  const nodeLabel = String(node?.label || nodeType || nodeId).trim() || nodeId
  const position = Array.isArray(node?.position) && node.position.length === 2
    ? node.position
    : [Number(node?.position?.x || 0), Number(node?.position?.y || 0)]

  const data = node?.data && typeof node.data === 'object' ? node.data : {}
  if (nodeType === 'agent' || nodeType === 'agent.chat') {
    const endpoint = config.backendPublicBaseUrl
      ? `${config.backendPublicBaseUrl}/api/workflows/webhooks/agent-node`
      : '/api/workflows/webhooks/agent-node'
    return {
      id: nodeId,
      name: nodeLabel,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position,
      parameters: {
        method: 'POST',
        url: endpoint,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: JSON.stringify({
          runId: '={{$json["runId"]}}',
          userId: '={{$json["userId"]}}',
          workflowId: '={{$json["workflowId"]}}',
          agentId: String(data.agentId || ''),
          prompt: String(data.prompt || ''),
          input: '={{$json["input"]}}',
          uploadedFiles: Array.isArray(data.uploadedFiles) ? data.uploadedFiles : [],
          timeoutMs: Number(data.timeoutMs || 0) || undefined,
          webhookSecret: config.n8nWebhookSecret || undefined,
        }),
      },
    }
  }

  const typeMap = {
    if: 'n8n-nodes-base.if',
    switch: 'n8n-nodes-base.switch',
    merge: 'n8n-nodes-base.merge',
    wait: 'n8n-nodes-base.wait',
  }
  return {
    id: nodeId,
    name: nodeLabel,
    type: typeMap[nodeType] || 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position,
    parameters: data.parameters && typeof data.parameters === 'object' ? data.parameters : {},
  }
}

function toN8nDefinition(workflow) {
  const nodes = workflow.canvasDefinition.nodes.map(toN8nNode)
  const connections = {}
  for (const edge of workflow.canvasDefinition.edges) {
    const source = String(edge?.source || '').trim()
    const target = String(edge?.target || '').trim()
    if (!source || !target) continue
    if (!connections[source]) connections[source] = { main: [[]] }
    connections[source].main[0].push({ node: target, type: 'main', index: 0 })
  }
  return {
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
    },
  }
}

export function listWorkflowSummaries(userId) {
  return listWorkflowsByUser(userId)
}

export function getWorkflowDetail(workflowId, userId) {
  return getWorkflowById(workflowId, userId)
}

export function createWorkflow(payload, userId) {
  const basic = normalizeBasicFields(payload)
  const canvasDefinition = normalizeCanvasDefinition(payload?.canvasDefinition)
  const timestamp = now()
  const workflow = {
    id: newWorkflowId(),
    userId,
    name: basic.name,
    description: basic.description,
    canvasDefinition,
    n8nDefinition: null,
    n8nWorkflowId: null,
    publishStatus: 'draft',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  insertWorkflow(workflow)
  return getWorkflowById(workflow.id, userId)
}

export function updateWorkflowDraft(workflowId, payload, userId) {
  const existing = getWorkflowById(workflowId, userId)
  if (!existing) throw new Error('workflow not found')
  const fields = {
    updatedAt: now(),
  }
  if (payload?.name !== undefined || payload?.description !== undefined) {
    const basic = normalizeBasicFields({
      name: payload?.name ?? existing.name,
      description: payload?.description ?? existing.description,
    })
    fields.name = basic.name
    fields.description = basic.description
  }
  if (payload?.canvasDefinition !== undefined) {
    fields.canvasDefinition = normalizeCanvasDefinition(payload.canvasDefinition)
    fields.version = Number(existing.version || 1) + 1
    if (existing.publishStatus === 'active' || existing.publishStatus === 'published') {
      fields.publishStatus = 'draft'
    }
  }
  updateWorkflow(workflowId, userId, fields)
  return getWorkflowById(workflowId, userId)
}

export async function publishWorkflow(workflowId, userId) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) throw new Error('workflow not found')
  const n8nDefinition = toN8nDefinition(workflow)
  const upserted = await upsertN8nWorkflow({
    n8nWorkflowId: workflow.n8nWorkflowId || null,
    name: workflow.name,
    n8nDefinition,
    version: workflow.version,
  })
  const timestamp = now()
  updateWorkflow(workflowId, userId, {
    n8nDefinition,
    n8nWorkflowId: upserted.id,
    publishStatus: 'published',
    updatedAt: timestamp,
  })
  return getWorkflowById(workflowId, userId)
}

export async function activateWorkflow(workflowId, userId, active) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) throw new Error('workflow not found')
  if (!workflow.n8nWorkflowId) {
    throw new Error('workflow has not been published to n8n')
  }
  await setN8nWorkflowActive(workflow.n8nWorkflowId, active)
  updateWorkflow(workflowId, userId, {
    publishStatus: active ? 'active' : 'published',
    updatedAt: now(),
  })
  return getWorkflowById(workflowId, userId)
}

export async function removeWorkflow(workflowId, userId) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) return false
  if (workflow.n8nWorkflowId) {
    await deleteN8nWorkflow(workflow.n8nWorkflowId)
  }
  deleteWorkflow(workflowId, userId)
  return true
}
