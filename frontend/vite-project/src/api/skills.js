import { apiFetch, jsonOr } from './http.js'

export async function listSkills(agentId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills`)
  return jsonOr(res)
}

export async function installSkill(agentId, payload) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return jsonOr(res)
}

export async function deleteSkill(agentId, skillId) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`, {
    method: 'DELETE',
  })
  if (res.status === 404) return false
  await jsonOr(res)
  return true
}
