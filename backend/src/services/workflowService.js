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

function normalizeRelPath(inputPath) {
  const raw = String(inputPath || '').trim().replaceAll('\\', '/')
  if (!raw || raw.startsWith('/') || raw.includes('\0')) return ''
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) return ''
  if (parts.some((part) => part === '.' || part === '..')) return ''
  return parts.join('/')
}

function normalizeDeliverFiles(input) {
  const files = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const item of files) {
    const rel = normalizeRelPath(item)
    if (!rel || seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
  }
  return out
}

function normalizeInputDeliverables(input) {
  const refs = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const ref of refs) {
    const sourceNodeId = String(ref?.sourceNodeId || '').trim()
    const sourceAgentId = String(ref?.sourceAgentId || '').trim()
    const path = normalizeRelPath(ref?.path)
    if (!sourceNodeId || !path) continue
    const key = `${sourceNodeId}::${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ sourceNodeId, sourceAgentId, path })
  }
  return out
}

function normalizeResultDeliverables(input) {
  return normalizeInputDeliverables(input)
}

function normalizeBasicFields(payload) {
  const name = String(payload?.name || '').trim()
  if (!name) throw new Error('workflow name is required')
  if (name.length > 80) throw new Error('workflow name should be <= 80 characters')
  const description = String(payload?.description || '').trim().slice(0, 500)
  return { name, description }
}

function buildJsonBodyExpression(lines) {
  return `={{\n  {\n${lines.join(',\n')}\n  }\n}}`
}

function toN8nNode(node) {
  const nodeId = String(node?.id || crypto.randomUUID())
  const nodeType = String(node?.type || '').trim()
  const nodeLabel = String(node?.label || nodeType || nodeId).trim() || nodeId
  const position = Array.isArray(node?.position) && node.position.length === 2
    ? node.position
    : [Number(node?.position?.x || 0), Number(node?.position?.y || 0)]

  const data = node?.data && typeof node.data === 'object' ? node.data : {}
  const workflowWebhookBaseUrl = config.backendPublicBaseUrl
    ? config.backendPublicBaseUrl
    : `http://host.docker.internal:${config.port}`
  if (nodeType === 'agent' || nodeType === 'agent.chat') {
    const endpoint = `${workflowWebhookBaseUrl}/api/workflows/webhooks/agent-node`
    const deliverFiles = normalizeDeliverFiles(data.deliverFiles)
    const inputDeliverables = normalizeInputDeliverables(data.inputDeliverables)
    const timeoutValue = Number(data.timeoutMs || 0)
    const timeoutLiteral = Number.isFinite(timeoutValue) && timeoutValue > 0
      ? String(timeoutValue)
      : 'undefined'
    const webhookSecretLiteral = config.n8nWebhookSecret
      ? JSON.stringify(config.n8nWebhookSecret)
      : 'undefined'
    const jsonBody = buildJsonBodyExpression([
      `    "nodeId": ${JSON.stringify(nodeId)}`,
      '    "runId": $json["runId"] || $json["runContext"]?.["runId"] || $json["body"]?.["runId"] || ""',
      '    "userId": $json["userId"] || $json["runContext"]?.["userId"] || $json["body"]?.["userId"] || ""',
      '    "workflowId": $json["workflowId"] || $json["runContext"]?.["workflowId"] || $json["body"]?.["workflowId"] || ""',
      `    "agentId": ${JSON.stringify(String(data.agentId || ''))}`,
      `    "prompt": ${JSON.stringify(String(data.prompt || ''))}`,
      '    "input": $json["input"] || $json["runContext"]?.["input"] || $json["body"]?.["input"] || {}',
      `    "uploadedFiles": ${JSON.stringify(Array.isArray(data.uploadedFiles) ? data.uploadedFiles : [])}`,
      `    "deliverFiles": ${JSON.stringify(deliverFiles)}`,
      `    "inputDeliverables": ${JSON.stringify(inputDeliverables)}`,
      `    "timeoutMs": ${timeoutLiteral}`,
      `    "webhookSecret": ${webhookSecretLiteral}`,
    ])
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
        jsonBody,
      },
    }
  }
  if (nodeType === 'result') {
    const endpoint = `${workflowWebhookBaseUrl}/api/workflows/webhooks/result-node`
    const webhookSecretLiteral = config.n8nWebhookSecret
      ? JSON.stringify(config.n8nWebhookSecret)
      : 'undefined'
    const jsonBody = buildJsonBodyExpression([
      `    "nodeId": ${JSON.stringify(nodeId)}`,
      '    "runId": $json["runId"] || $json["runContext"]?.["runId"] || $json["body"]?.["runId"] || ""',
      '    "userId": $json["userId"] || $json["runContext"]?.["userId"] || $json["body"]?.["userId"] || ""',
      '    "workflowId": $json["workflowId"] || $json["runContext"]?.["workflowId"] || $json["body"]?.["workflowId"] || ""',
      `    "resultDeliverables": ${JSON.stringify(normalizeResultDeliverables(data.resultDeliverables))}`,
      `    "archiveName": ${JSON.stringify(String(data.archiveName || 'workflow-result.zip'))}`,
      `    "webhookSecret": ${webhookSecretLiteral}`,
    ])
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
        jsonBody,
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

function getNodeMap(workflow) {
  const list = Array.isArray(workflow?.canvasDefinition?.nodes) ? workflow.canvasDefinition.nodes : []
  return new Map(list.map((node) => [String(node?.id || '').trim(), node]))
}

export function isWorkflowTerminalNode({ workflowId, userId, nodeId }) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) return false
  const currentNodeId = String(nodeId || '').trim()
  if (!currentNodeId) return false
  const edges = Array.isArray(workflow?.canvasDefinition?.edges) ? workflow.canvasDefinition.edges : []
  return !edges.some((edge) => String(edge?.source || '').trim() === currentNodeId)
}

export function resolveAgentNodeExecutionPlan({ workflowId, userId, nodeId }) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) throw new Error('workflow not found')
  const currentNodeId = String(nodeId || '').trim()
  if (!currentNodeId) throw new Error('nodeId is required')

  const nodeMap = getNodeMap(workflow)
  const currentNode = nodeMap.get(currentNodeId)
  if (!currentNode) throw new Error('workflow node not found')
  if (String(currentNode?.type || '').trim() !== 'agent') throw new Error('node is not agent type')

  const agentId = String(currentNode?.data?.agentId || '').trim()
  if (!agentId) throw new Error('agentId is required')

  const deliverFiles = normalizeDeliverFiles(currentNode?.data?.deliverFiles)
  const inputDeliverables = normalizeInputDeliverables(currentNode?.data?.inputDeliverables)

  const refsBySourceNode = new Map()
  for (const ref of inputDeliverables) {
    const list = refsBySourceNode.get(ref.sourceNodeId) || []
    list.push(ref.path)
    refsBySourceNode.set(ref.sourceNodeId, [...new Set(list)])
  }

  const preDeliveries = []
  for (const [sourceNodeId, files] of refsBySourceNode.entries()) {
    const sourceNode = nodeMap.get(sourceNodeId)
    const sourceAgentId = String(sourceNode?.data?.agentId || '').trim()
    if (!sourceAgentId || sourceAgentId === agentId) continue
    preDeliveries.push({
      fromNodeId: sourceNodeId,
      fromAgentId: sourceAgentId,
      toNodeId: currentNodeId,
      toAgentId: agentId,
      files: normalizeDeliverFiles(files),
    })
  }

  const edges = Array.isArray(workflow?.canvasDefinition?.edges) ? workflow.canvasDefinition.edges : []
  const downRefMap = new Map()
  for (const edge of edges) {
    const source = String(edge?.source || '').trim()
    const target = String(edge?.target || '').trim()
    if (source !== currentNodeId || !target) continue
    const targetNode = nodeMap.get(target)
    if (!targetNode || String(targetNode?.type || '').trim() !== 'agent') continue
    const targetAgentId = String(targetNode?.data?.agentId || '').trim()
    if (!targetAgentId || targetAgentId === agentId) continue
    const requestedRefs = normalizeInputDeliverables(targetNode?.data?.inputDeliverables)
      .filter((ref) => ref.sourceNodeId === currentNodeId)
      .map((ref) => ref.path)
    const files = requestedRefs.length ? requestedRefs : deliverFiles
    if (!files.length) continue
    const key = `${target}::${targetAgentId}`
    const list = downRefMap.get(key) || []
    downRefMap.set(key, [...new Set([...list, ...files])])
  }

  const postDeliveries = [...downRefMap.entries()].map(([key, files]) => {
    const [toNodeId, toAgentId] = key.split('::')
    return {
      fromNodeId: currentNodeId,
      fromAgentId: agentId,
      toNodeId,
      toAgentId,
      files: normalizeDeliverFiles(files),
    }
  })

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    nodeId: currentNodeId,
    nodeLabel: String(currentNode?.label || currentNode?.data?.label || currentNodeId),
    agentId,
    prompt: String(currentNode?.data?.prompt || ''),
    timeoutMs: Number(currentNode?.data?.timeoutMs || 0) || null,
    uploadedFiles: Array.isArray(currentNode?.data?.uploadedFiles) ? currentNode.data.uploadedFiles : [],
    deliverFiles,
    inputDeliverables,
    preDeliveries,
    postDeliveries,
  }
}

export function resolveResultNodeExecutionPlan({ workflowId, userId, nodeId }) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) throw new Error('workflow not found')
  const currentNodeId = String(nodeId || '').trim()
  if (!currentNodeId) throw new Error('nodeId is required')

  const nodeMap = getNodeMap(workflow)
  const currentNode = nodeMap.get(currentNodeId)
  if (!currentNode) throw new Error('workflow node not found')
  if (String(currentNode?.type || '').trim() !== 'result') throw new Error('node is not result type')

  const resultDeliverables = normalizeResultDeliverables(currentNode?.data?.resultDeliverables)
  const enriched = resultDeliverables
    .map((ref) => {
      const sourceNode = nodeMap.get(ref.sourceNodeId)
      const sourceAgentId = String(ref.sourceAgentId || sourceNode?.data?.agentId || '').trim()
      if (!sourceAgentId) return null
      return {
        ...ref,
        sourceAgentId,
        sourceNodeLabel: String(sourceNode?.label || sourceNode?.data?.label || ref.sourceNodeId),
      }
    })
    .filter(Boolean)

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    nodeId: currentNodeId,
    nodeLabel: String(currentNode?.label || currentNode?.data?.label || currentNodeId),
    archiveName: String(currentNode?.data?.archiveName || 'workflow-result.zip'),
    resultDeliverables: enriched,
  }
}

function toN8nDefinition(workflow) {
  const nodes = workflow.canvasDefinition.nodes.map(toN8nNode)
  const usedNames = new Set()
  for (const node of nodes) {
    const fallback = String(node?.id || crypto.randomUUID())
    const base = String(node?.name || fallback).trim() || fallback
    let name = base
    if (usedNames.has(name)) {
      const suffix = String(node?.id || '').slice(-6) || String(Date.now()).slice(-6)
      name = `${base}__${suffix}`
      let i = 2
      while (usedNames.has(name)) {
        name = `${base}__${suffix}_${i}`
        i += 1
      }
    }
    node.name = name
    usedNames.add(name)
  }
  const n8nNameByNodeId = new Map(nodes.map((node) => [String(node?.id || ''), String(node?.name || '')]))
  const nodeById = new Map(workflow.canvasDefinition.nodes.map((node) => [String(node?.id || ''), node]))
  const canvasEdges = Array.isArray(workflow?.canvasDefinition?.edges) ? workflow.canvasDefinition.edges : []
  const incomingTargets = new Set(canvasEdges.map((edge) => String(edge?.target || '').trim()).filter(Boolean))
  const rootNodeIds = [...nodeMapKeys(nodeById)].filter((id) => !incomingTargets.has(id))
  const connections = {}

  function resolveOutputIndex(edge) {
    const source = String(edge?.source || '').trim()
    const sourceHandle = String(edge?.sourceHandle || '').trim().toLowerCase()
    const sourceNode = nodeById.get(source)
    const sourceType = String(sourceNode?.type || '').trim().toLowerCase()
    if (sourceType === 'if') {
      if (sourceHandle === 'if-false') return 1
      return 0
    }
    if (sourceType === 'switch') {
      const matched = sourceHandle.match(/^switch-(\d+)$/)
      if (matched) {
        const idx = Number(matched[1])
        return Number.isFinite(idx) && idx >= 0 ? idx : 0
      }
    }
    return 0
  }

  function ensureOutputBucket(conn, outputIndex) {
    const idx = Math.max(0, Number(outputIndex || 0))
    while (conn.main.length <= idx) {
      conn.main.push([])
    }
    return idx
  }

  for (const edge of canvasEdges) {
    const sourceId = String(edge?.source || '').trim()
    const targetId = String(edge?.target || '').trim()
    if (!sourceId || !targetId) continue
    const sourceName = String(n8nNameByNodeId.get(sourceId) || '').trim()
    const targetName = String(n8nNameByNodeId.get(targetId) || '').trim()
    if (!sourceName || !targetName) continue
    if (!connections[sourceName]) connections[sourceName] = { main: [[]] }
    const outputIndex = ensureOutputBucket(connections[sourceName], resolveOutputIndex(edge))
    connections[sourceName].main[outputIndex].push({ node: targetName, type: 'main', index: 0 })
  }

  const triggerNodeId = `trigger_${String(workflow.id || '').replace(/[^a-zA-Z0-9_]/g, '_') || 'workflow'}`
  const triggerNodeNameBase = `trigger_${String(workflow.id || 'workflow')}`
  let triggerNodeName = triggerNodeNameBase
  let triggerSeq = 2
  while (usedNames.has(triggerNodeName)) {
    triggerNodeName = `${triggerNodeNameBase}_${triggerSeq}`
    triggerSeq += 1
  }
  usedNames.add(triggerNodeName)
  const triggerNode = {
    id: triggerNodeId,
    name: triggerNodeName,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-320, 260],
    parameters: {
      path: `multiagent-workflow/${workflow.id}`,
      httpMethod: 'POST',
      responseMode: 'onReceived',
      options: {},
    },
  }
  nodes.push(triggerNode)
  if (!connections[triggerNodeName]) connections[triggerNodeName] = { main: [[]] }
  for (const rootId of rootNodeIds) {
    const targetName = String(n8nNameByNodeId.get(rootId) || '').trim()
    if (!targetName) continue
    connections[triggerNodeName].main[0].push({ node: targetName, type: 'main', index: 0 })
  }

  return {
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
    },
  }
}

function nodeMapKeys(map) {
  const out = []
  for (const key of map.keys()) {
    if (key) out.push(key)
  }
  return out
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
