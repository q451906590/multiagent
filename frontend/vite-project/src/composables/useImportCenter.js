import { reactive } from 'vue'
import { listImportedAgents } from '../api/importCenter.js'

const state = reactive({
  items: [],
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
      const list = await listImportedAgents()
      state.items.splice(0, state.items.length, ...(Array.isArray(list) ? list : []))
      state.loaded = true
      return state.items
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
