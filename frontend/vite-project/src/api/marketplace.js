import { apiFetch, jsonOr } from './http.js'

export async function listMarketplaceAgents() {
  const res = await apiFetch('/api/marketplace/agents')
  return jsonOr(res)
}

export async function getMarketplaceAgentDetail(id) {
  const res = await apiFetch(`/api/marketplace/agents/${encodeURIComponent(id)}`)
  return jsonOr(res)
}

export async function publishMarketplaceAgent(payload) {
  const res = await apiFetch('/api/marketplace/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function installMarketplaceAgent(id) {
  const res = await apiFetch(`/api/marketplace/agents/${encodeURIComponent(id)}/install`, {
    method: 'POST',
  })
  return jsonOr(res)
}
