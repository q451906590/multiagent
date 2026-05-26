import { reactive } from 'vue'
import * as workflowsApi from '../api/workflows.js'

const state = reactive({
  list: [],
  selectedWorkflowId: '',
  nodes: [],
  edges: [],
  loading: false,
  saving: false,
  running: false,
  error: '',
  lastRun: null,
})

let listPromise = null

function normalizeNode(node) {
  return {
    id: String(node?.id || ''),
    type: String(node?.type || 'agent'),
    position: node?.position && typeof node.position === 'object'
      ? { x: Number(node.position.x || 0), y: Number(node.position.y || 0) }
      : { x: 0, y: 0 },
    data: node?.data && typeof node.data === 'object' ? { ...node.data } : {},
    label: String(node?.label || ''),
  }
}

function normalizeEdge(edge) {
  return {
    id: String(edge?.id || `${edge?.source || ''}-${edge?.target || ''}`),
    source: String(edge?.source || ''),
    target: String(edge?.target || ''),
    label: String(edge?.label || ''),
  }
}

function setCanvas(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes.map(normalizeNode) : []
  const edges = Array.isArray(definition?.edges) ? definition.edges.map(normalizeEdge) : []
  state.nodes.splice(0, state.nodes.length, ...nodes)
  state.edges.splice(0, state.edges.length, ...edges)
}

function getCurrentWorkflow() {
  return state.list.find((item) => item.id === state.selectedWorkflowId) || null
}

function upsertWorkflowInList(workflow) {
  const idx = state.list.findIndex((item) => item.id === workflow.id)
  if (idx >= 0) state.list.splice(idx, 1, workflow)
  else state.list.unshift(workflow)
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
        setCanvas(state.list[0].canvasDefinition || {})
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
      data: node.data && typeof node.data === 'object' ? { ...node.data } : {},
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
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
  await saveCurrentWorkflow()
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

async function removeWorkflow(id) {
  const ok = await workflowsApi.deleteWorkflow(id)
  if (!ok) return false
  const idx = state.list.findIndex((item) => item.id === id)
  if (idx >= 0) state.list.splice(idx, 1)
  if (state.selectedWorkflowId === id) {
    state.selectedWorkflowId = state.list[0]?.id || ''
    if (state.selectedWorkflowId) {
      setCanvas(state.list[0].canvasDefinition || {})
    } else {
      setCanvas({ nodes: [], edges: [] })
    }
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
    removeWorkflow,
    serializeCanvas,
    setCanvas,
    getCurrentWorkflow,
  }
}
