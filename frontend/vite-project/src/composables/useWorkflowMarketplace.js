import { reactive } from 'vue'
import * as workflowMarketplaceApi from '../api/workflowMarketplace.js'
import { listMarketplaceTags } from '../api/marketplace.js'

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
      const list = await workflowMarketplaceApi.listWorkflowMarketplace({ tagIds: state.selectedTagIds })
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
  const detail = await workflowMarketplaceApi.getWorkflowMarketplaceDetail(key)
  state.detailById[key] = detail
  return detail
}

async function publishWorkflow({ workflowId, title, description, tags }) {
  const created = await workflowMarketplaceApi.publishWorkflowMarketplace({
    workflowId,
    title,
    description,
    tags: Array.isArray(tags) ? tags : state.selectedTagIds,
  })
  state.detailById[created.id] = created
  await loadMarketplace(true)
  return created
}

async function installWorkflow(templateId) {
  return workflowMarketplaceApi.installWorkflowMarketplace(templateId)
}

async function loadTags(force = false) {
  if (!force && state.tagsLoaded) return state.tags
  state.tagsLoading = true
  try {
    const tags = await listMarketplaceTags()
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

export function useWorkflowMarketplace() {
  return {
    state,
    loadMarketplace,
    loadDetail,
    publishWorkflow,
    installWorkflow,
    loadTags,
    setSelectedTagIds,
  }
}
