import { apiFetch, jsonOr } from './http.js'

export async function listMcp(agentId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp`)
  return jsonOr(res)
}

export async function createMcp(agentId, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function updateMcp(agentId, mcpId, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp/${encodeURIComponent(mcpId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function deleteMcp(agentId, mcpId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp/${encodeURIComponent(mcpId)}`, {
    method: 'DELETE',
  })
  if (res.status === 404) return false
  await jsonOr(res)
  return true
}

export async function installMcp(agentId, mcpId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp/${encodeURIComponent(mcpId)}/install`, {
    method: 'POST',
  })
  return jsonOr(res)
}

export async function uninstallMcp(agentId, mcpId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/mcp/${encodeURIComponent(mcpId)}/uninstall`, {
    method: 'POST',
  })
  return jsonOr(res)
}
