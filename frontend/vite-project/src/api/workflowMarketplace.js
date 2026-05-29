import { apiFetch, jsonOr } from './http.js'

export async function listWorkflowMarketplace({ tagIds = [] } = {}) {
  const query = new URLSearchParams()
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    query.set('tags', tagIds.join(','))
  }
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const res = await apiFetch(`/api/marketplace/workflows${suffix}`)
  return jsonOr(res)
}

export async function getWorkflowMarketplaceDetail(id) {
  const res = await apiFetch(`/api/marketplace/workflows/${encodeURIComponent(id)}`)
  return jsonOr(res)
}

export async function publishWorkflowMarketplace(payload) {
  const res = await apiFetch('/api/marketplace/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function installWorkflowMarketplace(id) {
  const res = await apiFetch(`/api/marketplace/workflows/${encodeURIComponent(id)}/install`, {
    method: 'POST',
  })
  return jsonOr(res)
}
