import { reactive } from 'vue'
import * as marketplaceApi from '../api/marketplace.js'

const state = reactive({
  items: [],
  loading: false,
  loaded: false,
  error: null,
  detailById: {},
})

let loadPromise = null

async function loadMarketplace(force = false) {
  if (!force && state.loaded) return state.items
  if (!force && loadPromise) return loadPromise
  loadPromise = (async () => {
    state.loading = true
    state.error = null
    try {
      const list = await marketplaceApi.listMarketplaceAgents()
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

async function loadDetail(id, { force = false } = {}) {
  const key = String(id || '').trim()
  if (!key) return null
  if (!force && state.detailById[key]) return state.detailById[key]
  const detail = await marketplaceApi.getMarketplaceAgentDetail(key)
  state.detailById[key] = detail
  return detail
}

async function publishAgent({ agentId, title, description }) {
  const created = await marketplaceApi.publishMarketplaceAgent({ agentId, title, description })
  state.detailById[created.id] = created
  await loadMarketplace(true)
  return created
}

async function installAgent(templateId) {
  return marketplaceApi.installMarketplaceAgent(templateId)
}

export function useMarketplace() {
  return {
    state,
    loadMarketplace,
    loadDetail,
    publishAgent,
    installAgent,
  }
}
