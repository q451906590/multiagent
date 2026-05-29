import { nextTick, reactive } from 'vue'
import * as workflowsApi from '../api/workflows.js'

const state = reactive({
  list: [],
  selectedWorkflowId: '',
  nodes: [],
  edges: [],
  draftDirty: false,
  lastSavedSnapshot: '',
  loading: false,
  saving: false,
  running: false,
  error: '',
  lastRun: null,
})

let listPromise = null
const deletedNodeIds = new Set()
const deletedEdgeIds = new Set()

function normalizeNode(node) {
  const sourceData = node?.data && typeof node.data === 'object' ? { ...node.data } : {}
  delete sourceData.runStatus
  delete sourceData.resultArchive
  const sourceStyle = node?.style && typeof node.style === 'object' ? { ...node.style } : {}
  delete sourceStyle.borderColor
  delete sourceStyle.boxShadow
  return {
    id: String(node?.id || ''),
    type: String(node?.type || 'agent'),
    position: node?.position && typeof node.position === 'object'
      ? { x: Number(node.position.x || 0), y: Number(node.position.y || 0) }
      : { x: 0, y: 0 },
    data: sourceData,
    label: String(node?.label || ''),
    style: sourceStyle,
  }
}

function normalizeEdge(edge) {
  return {
    id: String(edge?.id || `${edge?.source || ''}-${edge?.target || ''}`),
    source: String(edge?.source || ''),
    target: String(edge?.target || ''),
    sourceHandle: String(edge?.sourceHandle || ''),
    targetHandle: String(edge?.targetHandle || ''),
    label: String(edge?.label || ''),
  }
}

function setCanvas(definition, options = {}) {
  const markDirty = Boolean(options.markDirty)
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes.map(normalizeNode) : []
  const edges = Array.isArray(definition?.edges) ? definition.edges.map(normalizeEdge) : []
  deletedNodeIds.clear()
  deletedEdgeIds.clear()
  state.nodes.splice(0, state.nodes.length, ...nodes)
  nextTick(() => {
    state.edges.splice(0, state.edges.length, ...edges)
  })
  if (markDirty) {
    updateDraftDirty()
  } else {
    markDraftSaved()
  }
}

function clearLastRun() {
  state.lastRun = null
}

function getCurrentWorkflow() {
  return state.list.find((item) => item.id === state.selectedWorkflowId) || null
}

function upsertWorkflowInList(workflow) {
  const idx = state.list.findIndex((item) => item.id === workflow.id)
  if (idx >= 0) state.list.splice(idx, 1, workflow)
  else state.list.unshift(workflow)
}

function markDraftSaved() {
  state.lastSavedSnapshot = JSON.stringify(serializeCanvas())
  state.draftDirty = false
}

function updateDraftDirty() {
  state.draftDirty = JSON.stringify(serializeCanvas()) !== state.lastSavedSnapshot
}

function markDraftChanged() {
  updateDraftDirty()
}

async function ensureLoaded() {
  if (listPromise) return listPromise
  listPromise = (async () => {
    state.loading = true
    state.error = ''
    try {
      const list = await workflowsApi.listWorkflows()
      state.list.splice(0, state.list.length, ...(Array.isArray(list) ? list : []))
      if (!state.selectedWorkflowId && state.list.length) {
        state.selectedWorkflowId = state.list[0].id
      }
    } catch (err) {
      state.error = err?.message || String(err)
    } finally {
      state.loading = false
      listPromise = null
    }
  })()
  return listPromise
}

async function selectWorkflow(id) {
  clearLastRun()
  state.selectedWorkflowId = String(id || '')
  if (!state.selectedWorkflowId) {
    setCanvas({ nodes: [], edges: [] })
    return null
  }
  const workflow = await workflowsApi.getWorkflow(state.selectedWorkflowId)
  upsertWorkflowInList(workflow)
  setCanvas(workflow.canvasDefinition || {})
  return workflow
}

async function createNewWorkflow(payload = {}) {
  const created = await workflowsApi.createWorkflow({
    name: payload.name || `Workflow ${state.list.length + 1}`,
    description: payload.description || '',
    canvasDefinition: payload.canvasDefinition || { nodes: [], edges: [] },
  })
  upsertWorkflowInList(created)
  await selectWorkflow(created.id)
  return created
}

function addNodeToDraft(definition = {}) {
  const nextId = `${String(definition.type || 'node')}_${Date.now()}`
  const data = definition?.data && typeof definition.data === 'object'
    ? JSON.parse(JSON.stringify(definition.data))
    : {}
  const nextNode = normalizeNode({
    id: nextId,
    type: definition.type,
    label: definition.label,
    position: { x: 120 + state.nodes.length * 40, y: 120 + state.nodes.length * 24 },
    data: {
      ...data,
      label: definition.label,
    },
  })
  deletedNodeIds.delete(nextId)
  state.nodes.push(nextNode)
  markDraftChanged()
  return nextNode
}

function updateNodeInDraft(next) {
  const nodeId = String(next?.id || '').trim()
  if (!nodeId) return false
  const idx = state.nodes.findIndex((item) => String(item?.id || '').trim() === nodeId)
  if (idx < 0) return false
  deletedNodeIds.delete(nodeId)
  state.nodes.splice(idx, 1, normalizeNode(next))
  markDraftChanged()
  return true
}

function removeNodeFromDraft(nodeId) {
  const id = String(nodeId || '').trim()
  if (!id) return false
  deletedNodeIds.add(id)
  const beforeNodeCount = state.nodes.length
  state.nodes.splice(0, state.nodes.length, ...state.nodes.filter((item) => String(item?.id || '') !== id))
  state.edges.splice(
    0,
    state.edges.length,
    ...state.edges.filter((edge) => String(edge?.source || '') !== id && String(edge?.target || '') !== id)
  )
  const changed = beforeNodeCount !== state.nodes.length
  if (changed) markDraftChanged()
  return changed
}

function removeNodesFromDraft(nodeIds = []) {
  const removeSet = new Set((Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  if (!removeSet.size) return false
  for (const id of removeSet) deletedNodeIds.add(id)
  const beforeNodeCount = state.nodes.length
  state.nodes.splice(0, state.nodes.length, ...state.nodes.filter((item) => !removeSet.has(String(item?.id || '').trim())))
  state.edges.splice(
    0,
    state.edges.length,
    ...state.edges.filter((edge) => !removeSet.has(String(edge?.source || '').trim()) && !removeSet.has(String(edge?.target || '').trim()))
  )
  const changed = beforeNodeCount !== state.nodes.length
  if (changed) markDraftChanged()
  return changed
}

function removeEdgesFromDraft(edgeIds = []) {
  const removeSet = new Set((Array.isArray(edgeIds) ? edgeIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  if (!removeSet.size) return false
  for (const id of removeSet) deletedEdgeIds.add(id)
  const beforeEdgeCount = state.edges.length
  state.edges.splice(0, state.edges.length, ...state.edges.filter((edge) => !removeSet.has(String(edge?.id || '').trim())))
  const changed = beforeEdgeCount !== state.edges.length
  if (changed) markDraftChanged()
  return changed
}

function patchNodesFromCanvas(nodes) {
  if (!Array.isArray(nodes)) return false
  const list = nodes.map(normalizeNode).filter((node) => String(node?.id || '').trim())
  if (!list.length && state.nodes.length) return false
  const mergedMap = new Map(
    state.nodes.map((item) => [String(item?.id || '').trim(), item]).filter(([id]) => id)
  )
  for (const item of list) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    if (deletedNodeIds.has(id)) continue
    mergedMap.set(id, item)
  }
  const merged = Array.from(mergedMap.values())
  state.nodes.splice(0, state.nodes.length, ...merged)
  markDraftChanged()
  return true
}

function patchEdgesFromCanvas(edges) {
  if (!Array.isArray(edges)) return false
  const list = edges.map(normalizeEdge).filter((edge) => String(edge?.id || '').trim())
  if (!list.length && state.edges.length) return false
  const mergedMap = new Map(
    state.edges.map((item) => [String(item?.id || '').trim(), item]).filter(([id]) => id)
  )
  for (const item of list) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    if (deletedEdgeIds.has(id)) continue
    if (deletedNodeIds.has(String(item?.source || '').trim())) continue
    if (deletedNodeIds.has(String(item?.target || '').trim())) continue
    mergedMap.set(id, item)
  }
  const merged = Array.from(mergedMap.values())
  state.edges.splice(0, state.edges.length, ...merged)
  markDraftChanged()
  return true
}

function moveNodeInDraft(payload) {
  const nodeId = String(payload?.id || '').trim()
  if (!nodeId) return false
  const idx = state.nodes.findIndex((item) => String(item?.id || '').trim() === nodeId)
  if (idx < 0) return false
  const target = state.nodes[idx]
  const nextX = Number(payload?.position?.x)
  const nextY = Number(payload?.position?.y)
  const nextNode = normalizeNode({
    ...target,
    position: {
      x: Number.isFinite(nextX) ? nextX : Number(target?.position?.x || 0),
      y: Number.isFinite(nextY) ? nextY : Number(target?.position?.y || 0),
    },
  })
  state.nodes.splice(idx, 1, nextNode)
  markDraftChanged()
  return true
}

function serializeCanvas() {
  return {
    nodes: state.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: {
        x: Number(node.position?.x || 0),
        y: Number(node.position?.y || 0),
      },
      label: node.label || node.data?.label || '',
      data: (() => {
        const data = node.data && typeof node.data === 'object' ? { ...node.data } : {}
        delete data.runStatus
        delete data.resultArchive
        return data
      })(),
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || '',
      targetHandle: edge.targetHandle || '',
      label: edge.label || '',
    })),
  }
}

async function saveCurrentWorkflow(extra = {}) {
  const workflow = getCurrentWorkflow()
  if (!workflow) throw new Error('no workflow selected')
  state.saving = true
  state.error = ''
  try {
    const updated = await workflowsApi.updateWorkflow(workflow.id, {
      name: extra.name ?? workflow.name,
      description: extra.description ?? workflow.description,
      canvasDefinition: serializeCanvas(),
    })
    upsertWorkflowInList(updated)
    if (updated?.canvasDefinition) {
      setCanvas(updated.canvasDefinition, { markDirty: false })
    } else {
      markDraftSaved()
    }
    return updated
  } catch (err) {
    state.error = err?.message || String(err)
    throw err
  } finally {
    state.saving = false
  }
}

async function publishCurrentWorkflow() {
  const workflow = getCurrentWorkflow()
  if (!workflow) throw new Error('no workflow selected')
  if (state.draftDirty) await saveCurrentWorkflow()
  const published = await workflowsApi.publishWorkflow(workflow.id)
  upsertWorkflowInList(published)
  return published
}

async function setCurrentWorkflowActive(active) {
  const workflow = getCurrentWorkflow()
  if (!workflow) throw new Error('no workflow selected')
  const updated = await workflowsApi.activateWorkflow(workflow.id, active)
  upsertWorkflowInList(updated)
  return updated
}

async function runCurrentWorkflow(input = {}) {
  const workflow = getCurrentWorkflow()
  if (!workflow) throw new Error('no workflow selected')
  state.running = true
  state.error = ''
  try {
    const run = await workflowsApi.runWorkflow(workflow.id, input)
    state.lastRun = run
    return run
  } catch (err) {
    state.error = err?.message || String(err)
    throw err
  } finally {
    state.running = false
  }
}

async function refreshWorkflowRun(runId) {
  const targetRunId = String(runId || state.lastRun?.id || '').trim()
  if (!targetRunId) return null
  const detail = await workflowsApi.getWorkflowRun(targetRunId)
  state.lastRun = detail
  return detail
}

async function removeWorkflow(id) {
  const ok = await workflowsApi.deleteWorkflow(id)
  if (!ok) return false
  const idx = state.list.findIndex((item) => item.id === id)
  if (idx >= 0) state.list.splice(idx, 1)
  if (state.selectedWorkflowId === id) {
    clearLastRun()
    state.selectedWorkflowId = state.list[0]?.id || ''
    setCanvas({ nodes: [], edges: [] })
  }
  return true
}

export function useWorkflow() {
  return {
    state,
    ensureLoaded,
    selectWorkflow,
    createNewWorkflow,
    saveCurrentWorkflow,
    publishCurrentWorkflow,
    setCurrentWorkflowActive,
    runCurrentWorkflow,
    refreshWorkflowRun,
    removeWorkflow,
    addNodeToDraft,
    updateNodeInDraft,
    removeNodeFromDraft,
    removeNodesFromDraft,
    removeEdgesFromDraft,
    patchNodesFromCanvas,
    patchEdgesFromCanvas,
    moveNodeInDraft,
    markDraftSaved,
    markDraftChanged,
    updateDraftDirty,
    clearLastRun,
    serializeCanvas,
    setCanvas,
    getCurrentWorkflow,
  }
}
