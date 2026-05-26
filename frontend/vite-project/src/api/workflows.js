import { apiFetch, jsonOr } from './http.js'

export async function listWorkflows() {
  const res = await apiFetch('/api/workflows')
  return jsonOr(res)
}

export async function createWorkflow(payload) {
  const res = await apiFetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function getWorkflow(id) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}`)
  return jsonOr(res)
}

export async function updateWorkflow(id, payload) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function deleteWorkflow(id) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (res.status === 404) return false
  await jsonOr(res)
  return true
}

export async function publishWorkflow(id) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}/publish`, { method: 'POST' })
  return jsonOr(res)
}

export async function activateWorkflow(id, active = true) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: Boolean(active) }),
  })
  return jsonOr(res)
}

export async function runWorkflow(id, input = {}) {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  return jsonOr(res)
}

export async function listWorkflowRuns(id, { limit = 30 } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}/runs?${params.toString()}`)
  return jsonOr(res)
}

export async function getWorkflowRun(runId) {
  const res = await apiFetch(`/api/workflow-runs/${encodeURIComponent(runId)}`)
  return jsonOr(res)
}
