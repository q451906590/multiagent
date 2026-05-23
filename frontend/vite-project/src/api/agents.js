import { apiFetch, jsonOr } from './http.js'

export async function listAgents() {
  const res = await apiFetch('/api/agents')
  return jsonOr(res)
}

export async function createAgent(payload) {
  const res = await apiFetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function updateAgent(id, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function getAgentHermesConfig(id) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}/hermes-config`)
  return jsonOr(res)
}

export async function updateAgentHermesConfig(id, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}/hermes-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function getAgentHermesEnv(id) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}/hermes-env`)
  return jsonOr(res)
}

export async function updateAgentHermesEnv(id, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}/hermes-env`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function deleteAgent(id) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (res.status === 404) return false
  await jsonOr(res)
  return true
}

export async function bootstrap() {
  const res = await apiFetch('/api/system/bootstrap', { method: 'POST' })
  return jsonOr(res)
}
