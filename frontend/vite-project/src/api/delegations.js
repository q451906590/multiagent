import { apiFetch, jsonOr } from './http.js'

export async function listDelegationKeys(agentId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/delegations/keys`)
  return jsonOr(res)
}

export async function createDelegationKey(agentId, payload = {}) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/delegations/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function revokeDelegationKey(agentId, keyId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/delegations/keys/${encodeURIComponent(keyId)}/revoke`, {
    method: 'POST',
  })
  return jsonOr(res)
}

export async function deleteDelegationKey(agentId, keyId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/delegations/keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  })
  return jsonOr(res)
}
