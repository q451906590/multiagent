import { apiFetch, jsonOr } from './http.js'

export async function listAgentFiles(agentId, { scope = 'delivery' } = {}) {
  const q = new URLSearchParams({ scope: String(scope || 'delivery') })
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/files?${q.toString()}`)
  return jsonOr(res)
}

export async function deliverAgentFiles(sourceAgentId, { targetAgentId, files }) {
  const res = await apiFetch(`/api/agents/${encodeURIComponent(sourceAgentId)}/files/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetAgentId, files }),
  })
  return jsonOr(res)
}

export async function uploadAgentFiles(agentId, { files, relativeDir } = {}) {
  const list = Array.isArray(files) ? files : []
  if (list.length === 0) throw new Error('files is required')
  const form = new FormData()
  for (const file of list) {
    form.append('files', file)
  }
  if (typeof relativeDir === 'string' && relativeDir.trim()) {
    form.append('relativeDir', relativeDir.trim())
  }
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/files/upload`, {
    method: 'POST',
    body: form,
  })
  return jsonOr(res)
}

export async function deleteAgentFile(agentId, { scope = 'delivery', path } = {}) {
  const relPath = String(path || '').trim()
  if (!relPath) throw new Error('path is required')
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: String(scope || 'delivery'), path: relPath }),
  })
  return jsonOr(res)
}

function parseDownloadFilename(contentDisposition, fallback = 'agent-files.zip') {
  const raw = String(contentDisposition || '')
  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch (_) {
      return utf8Match[1]
    }
  }
  const quoted = raw.match(/filename="([^"]+)"/i)
  if (quoted?.[1]) return quoted[1]
  const plain = raw.match(/filename=([^;]+)/i)
  if (plain?.[1]) return plain[1].trim()
  return fallback
}

export async function downloadAgentFilesZip(agentId, { scope = 'delivery', files } = {}) {
  const list = Array.isArray(files) ? files.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (list.length === 0) throw new Error('files is required')
  const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/files/download-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: String(scope || 'delivery'), files: list }),
  })

  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch (_) { /* noop */ }
    throw new Error(data?.message || data?.error || `${res.status} ${res.statusText}`)
  }

  const blob = await res.blob()
  const filename = parseDownloadFilename(res.headers.get('Content-Disposition'))
  return { blob, filename }
}
