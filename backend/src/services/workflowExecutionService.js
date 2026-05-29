import crypto from 'node:crypto'
import {
  getWorkflowById,
  getWorkflowRunByExecutionId,
  getWorkflowRunById,
  insertWorkflowRun,
  insertWorkflowRunEvent,
  listWorkflowRunEvents,
  listWorkflowRunsByWorkflow,
  updateWorkflowRun,
} from '../db.js'
import { triggerN8nWorkflow } from './n8nService.js'

function now() {
  return Date.now()
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

function sanitizeStatus(input, fallback = 'running') {
  const value = String(input || '').trim().toLowerCase()
  if (!value) return fallback
  const allowed = new Set(['queued', 'running', 'succeeded', 'failed', 'canceled'])
  return allowed.has(value) ? value : fallback
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildNodeLogs(events) {
  const list = Array.isArray(events) ? events : []
  const map = new Map()
  for (const event of list) {
    const nodeId = String(event?.nodeId || '').trim()
    if (!nodeId) continue
    if (!map.has(nodeId)) {
      map.set(nodeId, {
        nodeId,
        status: '',
        input: null,
        output: null,
        agentConversation: null,
        events: [],
      })
    }
    const item = map.get(nodeId)
    const payload = isPlainObject(event?.payload) ? event.payload : {}
    const eventStatus = String(event?.eventStatus || '').trim()
    if (eventStatus) item.status = eventStatus
    if ('nodeInput' in payload) {
      item.input = payload.nodeInput
    } else if (event?.eventType === 'node_input' && 'input' in payload) {
      item.input = payload.input
    }
    if ('nodeOutput' in payload) {
      item.output = payload.nodeOutput
    } else if (event?.eventType === 'node_output' && 'output' in payload) {
      item.output = payload.output
    }
    if (isPlainObject(payload.agentConversation)) {
      item.agentConversation = payload.agentConversation
    }
    item.events.push({
      eventType: String(event?.eventType || ''),
      eventStatus,
      createdAt: Number(event?.createdAt || 0),
      errorMessage: String(event?.errorMessage || ''),
    })
  }
  return [...map.values()]
}

export async function triggerWorkflowRun({ workflowId, userId, input, triggerSource = 'manual' }) {
  const workflow = getWorkflowById(workflowId, userId)
  if (!workflow) throw new Error('workflow not found')
  if (!workflow.n8nWorkflowId) {
    throw new Error('workflow has not been published to n8n')
  }

  const startedAt = now()
  const run = {
    id: newId('wfrun'),
    workflowId,
    userId,
    status: 'queued',
    input: input && typeof input === 'object' ? input : {},
    triggerSource,
    startedAt,
    finishedAt: null,
    errorMessage: null,
    output: null,
    n8nExecutionId: null,
  }
  insertWorkflowRun(run)
  insertWorkflowRunEvent({
    id: newId('wfevt'),
    runId: run.id,
    workflowId,
    userId,
    eventType: 'run_queued',
    eventStatus: 'queued',
    payload: { triggerSource, input: run.input },
    createdAt: startedAt,
  })

  try {
    const triggerPayload = {
      runId: run.id,
      workflowId,
      userId,
      input: run.input,
    }
    const triggered = await triggerN8nWorkflow({
      n8nWorkflowId: workflow.n8nWorkflowId,
      payload: triggerPayload,
    })
    updateWorkflowRun(run.id, userId, {
      status: 'running',
      n8nExecutionId: triggered.executionId || null,
    })
    insertWorkflowRunEvent({
      id: newId('wfevt'),
      runId: run.id,
      workflowId,
      userId,
      eventType: 'run_started',
      eventStatus: 'running',
      payload: {
        triggerPath: triggered.triggerPath,
        n8nExecutionId: triggered.executionId || '',
      },
      createdAt: now(),
    })
  } catch (err) {
    updateWorkflowRun(run.id, userId, {
      status: 'failed',
      errorMessage: err?.message || 'trigger_failed',
      finishedAt: now(),
    })
    insertWorkflowRunEvent({
      id: newId('wfevt'),
      runId: run.id,
      workflowId,
      userId,
      eventType: 'run_failed',
      eventStatus: 'failed',
      errorMessage: err?.message || 'trigger_failed',
      createdAt: now(),
    })
    throw err
  }

  return getWorkflowRunById(run.id, userId)
}

export function listRunsForWorkflow(workflowId, userId, { limit = 30 } = {}) {
  return listWorkflowRunsByWorkflow(workflowId, userId, { limit })
}

export function getWorkflowRunDetail(runId, userId) {
  const run = getWorkflowRunById(runId, userId)
  if (!run) return null
  const events = listWorkflowRunEvents(runId, userId, { limit: 500 })
  const nodeLogs = buildNodeLogs(events)
  return {
    ...run,
    events,
    nodeLogs,
  }
}

export function handleN8nRunEvent(payload) {
  const executionId = String(payload?.n8nExecutionId || payload?.executionId || '').trim()
  const runId = String(payload?.runId || '').trim()
  let run = null
  if (executionId) {
    run = getWorkflowRunByExecutionId(executionId)
  }
  if (!run && runId && payload?.userId) {
    run = getWorkflowRunById(runId, payload.userId)
  }
  if (!run) {
    throw new Error('workflow run not found for webhook event')
  }

  const status = sanitizeStatus(payload?.status, run.status)
  const eventType = String(payload?.eventType || 'node_event').trim() || 'node_event'
  const isFinished = ['succeeded', 'failed', 'canceled'].includes(status)
  updateWorkflowRun(run.id, run.userId, {
    status,
    output: payload?.output && typeof payload.output === 'object' ? payload.output : undefined,
    errorMessage: payload?.errorMessage ? String(payload.errorMessage) : undefined,
    finishedAt: isFinished ? now() : undefined,
    n8nExecutionId: executionId || undefined,
  })

  insertWorkflowRunEvent({
    id: newId('wfevt'),
    runId: run.id,
    workflowId: run.workflowId,
    userId: run.userId,
    nodeId: payload?.nodeId ? String(payload.nodeId) : '',
    eventType,
    eventStatus: status,
    payload: payload && typeof payload === 'object' ? payload : {},
    errorMessage: payload?.errorMessage ? String(payload.errorMessage) : '',
    createdAt: now(),
  })

  return getWorkflowRunById(run.id, run.userId)
}

export function appendWorkflowRunEvent({
  runId,
  userId,
  workflowId,
  nodeId,
  eventType,
  eventStatus = '',
  payload = {},
  errorMessage = '',
}) {
  const run = getWorkflowRunById(runId, userId)
  if (!run) return null
  insertWorkflowRunEvent({
    id: newId('wfevt'),
    runId: run.id,
    workflowId: workflowId || run.workflowId,
    userId: run.userId,
    nodeId: String(nodeId || ''),
    eventType: String(eventType || 'custom_event'),
    eventStatus: String(eventStatus || ''),
    payload: payload && typeof payload === 'object' ? payload : {},
    errorMessage: String(errorMessage || ''),
    createdAt: now(),
  })
  return getWorkflowRunById(run.id, run.userId)
}

export function markWorkflowRunFailed({
  runId,
  userId,
  workflowId,
  nodeId,
  errorMessage,
  payload = {},
}) {
  const run = getWorkflowRunById(runId, userId)
  if (!run) return null
  updateWorkflowRun(run.id, run.userId, {
    status: 'failed',
    errorMessage: String(errorMessage || 'workflow_node_failed'),
    finishedAt: now(),
  })
  insertWorkflowRunEvent({
    id: newId('wfevt'),
    runId: run.id,
    workflowId: workflowId || run.workflowId,
    userId: run.userId,
    nodeId: String(nodeId || ''),
    eventType: 'run_failed',
    eventStatus: 'failed',
    payload: payload && typeof payload === 'object' ? payload : {},
    errorMessage: String(errorMessage || 'workflow_node_failed'),
    createdAt: now(),
  })
  return getWorkflowRunById(run.id, run.userId)
}
