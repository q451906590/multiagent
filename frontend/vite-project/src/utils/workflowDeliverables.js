function normalizeRelPath(rawPath) {
  const raw = String(rawPath || '').trim().replaceAll('\\', '/')
  if (!raw) return ''
  if (raw.startsWith('/')) return ''
  if (raw.includes('\0')) return ''
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) return ''
  if (parts.some((part) => part === '.' || part === '..')) return ''
  return parts.join('/')
}

const START_TEXT_DELIVERABLE = 'user-input'
const START_UPLOADS_DELIVERABLE = 'user-uploaded-files'

export function normalizeDeliverFiles(input) {
  const items = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const item of items) {
    const path = normalizeRelPath(item)
    if (!path) continue
    if (seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

export function deliverableRefKey(ref) {
  const sourceNodeId = String(ref?.sourceNodeId || '').trim()
  const path = normalizeRelPath(ref?.path)
  return sourceNodeId && path ? `${sourceNodeId}::${path}` : ''
}

export function normalizeInputDeliverables(input) {
  const refs = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const ref of refs) {
    const sourceNodeId = String(ref?.sourceNodeId || '').trim()
    const sourceAgentId = String(ref?.sourceAgentId || '').trim()
    const path = normalizeRelPath(ref?.path)
    if (!sourceNodeId || !path) continue
    const key = `${sourceNodeId}::${path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      sourceNodeId,
      sourceAgentId,
      path,
    })
  }
  return out
}

export function buildDeliverableCatalog(allNodes, { excludeNodeId = '' } = {}) {
  const nodes = Array.isArray(allNodes) ? allNodes : []
  const pathByAgent = new Map()
  const items = []
  const seenRef = new Set()

  for (const node of nodes) {
    const nodeType = String(node?.type || '').trim()
    if (nodeType === 'start.userInput') {
      const nodeId = String(node?.id || '').trim()
      if (!nodeId || nodeId === excludeNodeId) continue
      const sourceNodeLabel = String(node?.label || node?.data?.label || nodeId)
      const startDeliverables = [
        { path: START_TEXT_DELIVERABLE, displayName: '用户输入文案' },
        { path: START_UPLOADS_DELIVERABLE, displayName: '用户上传文件' },
      ]
      for (const deliverable of startDeliverables) {
        const itemPath = normalizeRelPath(deliverable.path) || deliverable.path
        const key = `${nodeId}::${itemPath}`
        if (seenRef.has(key)) continue
        seenRef.add(key)
        items.push({
          sourceNodeId: nodeId,
          sourceAgentId: '',
          sourceNodeLabel,
          path: itemPath,
          displayName: deliverable.displayName,
        })
      }
      continue
    }
    if (nodeType !== 'agent' && nodeType !== 'agent.chat') continue
    const nodeId = String(node?.id || '').trim()
    if (!nodeId || nodeId === excludeNodeId) continue
    const sourceAgentId = String(node?.data?.agentId || '').trim()
    const deliverFiles = normalizeDeliverFiles(node?.data?.deliverFiles)
    for (const path of deliverFiles) {
      const key = `${nodeId}::${path}`
      if (seenRef.has(key)) continue
      seenRef.add(key)
      const agentPathKey = `${sourceAgentId}::${path}`
      pathByAgent.set(agentPathKey, (pathByAgent.get(agentPathKey) || 0) + 1)
      items.push({
        sourceNodeId: nodeId,
        sourceAgentId,
        sourceNodeLabel: String(node?.label || node?.data?.label || nodeId),
        path,
      })
    }
  }

  return items
    .map((item) => {
      const conflictCount = pathByAgent.get(`${item.sourceAgentId}::${item.path}`) || 0
      const hasAgentConflict = conflictCount > 1
      return {
        ...item,
        hasAgentConflict,
        displayLabel: item.displayName
          ? `${item.sourceNodeLabel} / ${item.displayName}`
          : `${item.sourceNodeLabel} / ${item.path}`,
      }
    })
    .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))
}
