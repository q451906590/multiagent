import { apiFetch, jsonOr } from './http.js'

export async function listImportedAgents() {
  const res = await apiFetch('/api/import-center/agents')
  return jsonOr(res)
}

export async function listImportedWorkflows() {
  const res = await apiFetch('/api/import-center/workflows')
  return jsonOr(res)
}
