import { reactive } from 'vue'
import * as marketplaceApi from '../api/marketplace.js'

const state = reactive({
  items: [],
  loading: false,
  loaded: false,
  error: null,
  detailById: {},
  tags: [],
  tagsLoaded: false,
  tagsLoading: false,
  selectedTagIds: [],
})

let loadPromise = null

async function loadMarketplace(force = false) {
  if (!force && state.loaded) return state.items
  if (!force && loadPromise) return loadPromise
  loadPromise = (async () => {
    state.loading = true
    state.error = null
    try {
      const list = await marketplaceApi.listMarketplaceAgents({ tagIds: state.selectedTagIds })
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

async function publishAgent({ agentId, title, description, tags }) {
  const created = await marketplaceApi.publishMarketplaceAgent({
    agentId,
    title,
    description,
    tags: Array.isArray(tags) ? tags : state.selectedTagIds,
  })
  state.detailById[created.id] = created
  await loadMarketplace(true)
  return created
}

async function installAgent(templateId) {
  return marketplaceApi.installMarketplaceAgent(templateId)
}

async function loadTags(force = false) {
  if (!force && state.tagsLoaded) return state.tags
  state.tagsLoading = true
  try {
    const tags = await marketplaceApi.listMarketplaceTags()
    state.tags.splice(0, state.tags.length, ...(Array.isArray(tags) ? tags : []))
    state.tagsLoaded = true
    return state.tags
  } finally {
    state.tagsLoading = false
  }
}

function setSelectedTagIds(tagIds) {
  const normalized = Array.isArray(tagIds)
    ? [...new Set(tagIds.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
  state.selectedTagIds.splice(0, state.selectedTagIds.length, ...normalized)
  state.loaded = false
}

async function createTag(name) {
  const created = await marketplaceApi.createMarketplaceTag({ name })
  await loadTags(true)
  return created
}

async function renameTag(id, name) {
  const updated = await marketplaceApi.updateMarketplaceTag(id, { name })
  await loadTags(true)
  await loadMarketplace(true)
  return updated
}

async function removeTag(id) {
  await marketplaceApi.deleteMarketplaceTag(id)
  const nextSelected = state.selectedTagIds.filter((item) => item !== id)
  setSelectedTagIds(nextSelected)
  await loadTags(true)
  await loadMarketplace(true)
}

export function useMarketplace() {
  return {
    state,
    loadMarketplace,
    loadDetail,
    publishAgent,
    installAgent,
    loadTags,
    setSelectedTagIds,
    createTag,
    renameTag,
    removeTag,
  }
}
