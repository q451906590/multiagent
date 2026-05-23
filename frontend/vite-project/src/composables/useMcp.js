import { reactive } from 'vue'
import * as mcpApi from '../api/mcp.js'

const stateByAgent = new Map()

function createState() {
  return reactive({
    items: [],
    loading: false,
    error: null,
  })
}

function getState(agentId) {
  if (!stateByAgent.has(agentId)) {
    stateByAgent.set(agentId, createState())
  }
  return stateByAgent.get(agentId)
}

export function useMcp(agentId) {
  const state = getState(agentId)

  async function refresh() {
    state.loading = true
    state.error = null
    try {
      const list = await mcpApi.listMcp(agentId)
      state.items.splice(0, state.items.length, ...list)
    } catch (err) {
      state.error = err?.message || String(err)
    } finally {
      state.loading = false
    }
  }

  async function create(payload) {
    const created = await mcpApi.createMcp(agentId, payload)
    state.items.push(created)
    return created
  }

  async function update(mcpId, payload) {
    const updated = await mcpApi.updateMcp(agentId, mcpId, payload)
    const idx = state.items.findIndex((item) => item.id === mcpId)
    if (idx >= 0) state.items.splice(idx, 1, updated)
    return updated
  }

  async function remove(mcpId) {
    const ok = await mcpApi.deleteMcp(agentId, mcpId)
    if (!ok) return false
    const idx = state.items.findIndex((item) => item.id === mcpId)
    if (idx >= 0) state.items.splice(idx, 1)
    return true
  }

  async function install(mcpId) {
    const updated = await mcpApi.installMcp(agentId, mcpId)
    const idx = state.items.findIndex((item) => item.id === mcpId)
    if (idx >= 0) state.items.splice(idx, 1, updated)
    return updated
  }

  async function uninstall(mcpId) {
    const updated = await mcpApi.uninstallMcp(agentId, mcpId)
    const idx = state.items.findIndex((item) => item.id === mcpId)
    if (idx >= 0) state.items.splice(idx, 1, updated)
    return updated
  }

  return {
    state,
    refresh,
    create,
    update,
    remove,
    install,
    uninstall,
  }
}
