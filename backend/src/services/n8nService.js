import { config } from '../config.js'
import { logger } from '../utils/logger.js'

function assertConfigured() {
  if (!config.n8nBaseUrl) {
    throw new Error('n8n is not configured: N8N_BASE_URL is required')
  }
}

function buildUrl(pathname) {
  return `${config.n8nBaseUrl}${pathname}`
}

async function requestN8n(pathname, { method = 'GET', body, allow404 = false } = {}) {
  assertConfigured()
  const headers = {
    'Content-Type': 'application/json',
  }
  if (config.n8nApiKey) headers['X-N8N-API-KEY'] = config.n8nApiKey
  const res = await fetch(buildUrl(pathname), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (allow404 && res.status === 404) return null
  let data = null
  try {
    data = await res.json()
  } catch (_) {
    data = null
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `${res.status} ${res.statusText}`
    throw new Error(`n8n request failed (${method} ${pathname}): ${message}`)
  }
  return data
}

function pickExecutionId(data) {
  if (!data || typeof data !== 'object') return ''
  const candidates = [
    data.executionId,
    data.id,
    data.data?.executionId,
    data.data?.id,
    data.execution?.id,
  ]
  for (const item of candidates) {
    const value = String(item || '').trim()
    if (value) return value
  }
  return ''
}

export async function upsertN8nWorkflow({ n8nWorkflowId, name, n8nDefinition, version }) {
  const payload = {
    name,
    nodes: Array.isArray(n8nDefinition?.nodes) ? n8nDefinition.nodes : [],
    connections: n8nDefinition?.connections && typeof n8nDefinition.connections === 'object'
      ? n8nDefinition.connections
      : {},
    settings: {
      saveExecutionProgress: true,
      saveManualExecutions: true,
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'all',
      executionTimeout: 3600,
      ...(n8nDefinition?.settings && typeof n8nDefinition.settings === 'object' ? n8nDefinition.settings : {}),
    },
  }

  if (!n8nWorkflowId) {
    const created = await requestN8n('/api/v1/workflows', { method: 'POST', body: payload })
    return {
      id: String(created?.id || created?.data?.id || '').trim(),
      raw: created,
    }
  }

  const updated = await requestN8n(`/api/v1/workflows/${encodeURIComponent(n8nWorkflowId)}`, {
    method: 'PUT',
    body: payload,
  })
  return {
    id: String(updated?.id || updated?.data?.id || n8nWorkflowId).trim(),
    raw: updated,
  }
}

export async function setN8nWorkflowActive(n8nWorkflowId, active) {
  if (!n8nWorkflowId) throw new Error('n8nWorkflowId is required')
  const id = encodeURIComponent(n8nWorkflowId)
  const desired = Boolean(active)
  const actionPath = desired ? `/api/v1/workflows/${id}/activate` : `/api/v1/workflows/${id}/deactivate`
  try {
    await requestN8n(actionPath, { method: 'POST' })
    return
  } catch (activateErr) {
    const message = String(activateErr?.message || '').toLowerCase()
    // For manually-triggered workflows, n8n "active" requires trigger nodes.
    // Our runtime triggers via API, so treat this as a valid no-op activation.
    if (desired && message.includes('no trigger node')) {
      logger.warn(`[n8n] workflow ${n8nWorkflowId} has no trigger node; treat activate as no-op for manual run mode`)
      return
    }
    throw new Error(`failed to set workflow active state: ${activateErr?.message || activateErr}`)
  }
}

export async function deleteN8nWorkflow(n8nWorkflowId) {
  if (!n8nWorkflowId) return
  await requestN8n(`/api/v1/workflows/${encodeURIComponent(n8nWorkflowId)}`, {
    method: 'DELETE',
    allow404: true,
  })
}

export async function triggerN8nWorkflow({ n8nWorkflowId, payload }) {
  if (!n8nWorkflowId) throw new Error('n8nWorkflowId is required')
  if (config.n8nWebhookBaseUrl) {
    const localWorkflowId = String(payload?.workflowId || '').trim()
    const webhookPathId = localWorkflowId || String(n8nWorkflowId || '').trim()
    const webhookUrl = `${config.n8nWebhookBaseUrl}/multiagent-workflow/${encodeURIComponent(webhookPathId)}`
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    })
    let data = null
    try {
      data = await res.json()
    } catch (_) {
      data = null
    }
    if (!res.ok) {
      const msg = data?.message || data?.error || `${res.status} ${res.statusText}`
      throw new Error(`n8n webhook trigger failed: ${msg}`)
    }
    return {
      executionId: pickExecutionId(data),
      raw: data,
      triggerPath: webhookUrl,
    }
  }

  const id = encodeURIComponent(n8nWorkflowId)
  const attempts = [
    `/api/v1/workflows/${id}/run`,
    `/api/v1/workflows/${id}/execute`,
  ]
  let lastErr = null
  for (const path of attempts) {
    try {
      const response = await requestN8n(path, { method: 'POST', body: payload || {} })
      return {
        executionId: pickExecutionId(response),
        raw: response,
        triggerPath: path,
      }
    } catch (err) {
      lastErr = err
    }
  }

  throw lastErr || new Error('failed to trigger n8n workflow')
}
