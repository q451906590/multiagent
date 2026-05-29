import { reactive } from 'vue'
import { listImportedAgents, listImportedWorkflows } from '../api/importCenter.js'

const state = reactive({
  agentItems: [],
  workflowItems: [],
  loading: false,
  loaded: false,
  error: null,
})

let loadPromise = null

async function loadImports(force = false) {
  if (!force && state.loaded) return state.items
  if (!force && loadPromise) return loadPromise
  loadPromise = (async () => {
    state.loading = true
    state.error = null
    try {
      const [agents, workflows] = await Promise.all([
        listImportedAgents(),
        listImportedWorkflows(),
      ])
      state.agentItems.splice(0, state.agentItems.length, ...(Array.isArray(agents) ? agents : []))
      state.workflowItems.splice(0, state.workflowItems.length, ...(Array.isArray(workflows) ? workflows : []))
      state.loaded = true
      return {
        agentItems: state.agentItems,
        workflowItems: state.workflowItems,
      }
    } catch (err) {
      state.error = err?.message || String(err)
      throw err
    } finally {
      state.loading = false
      loadPromise = null
    }
  })()
  return loadPromise
}

export function useImportCenter() {
  return {
    state,
    loadImports,
  }
}
