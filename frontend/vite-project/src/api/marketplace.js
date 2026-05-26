import { apiFetch, jsonOr } from './http.js'

export async function listMarketplaceAgents({ tagIds = [] } = {}) {
  const query = new URLSearchParams()
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    query.set('tags', tagIds.join(','))
  }
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const res = await apiFetch(`/api/marketplace/agents${suffix}`)
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

export async function listMarketplaceTags() {
  const res = await apiFetch('/api/marketplace/tags')
  return jsonOr(res)
}

export async function createMarketplaceTag(payload) {
  const res = await apiFetch('/api/marketplace/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function updateMarketplaceTag(id, payload) {
  const res = await apiFetch(`/api/marketplace/tags/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function deleteMarketplaceTag(id) {
  const res = await apiFetch(`/api/marketplace/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return jsonOr(res)
}
