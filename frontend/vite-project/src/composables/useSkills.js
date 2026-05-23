import { reactive } from 'vue'
import * as skillsApi from '../api/skills.js'

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

export function useSkills(agentId) {
  const state = getState(agentId)

  async function refresh() {
    state.loading = true
    state.error = null
    try {
      const list = await skillsApi.listSkills(agentId)
      state.items.splice(0, state.items.length, ...list)
    } catch (err) {
      state.error = err?.message || String(err)
    } finally {
      state.loading = false
    }
  }

  async function install(payload) {
    const installed = await skillsApi.installSkill(agentId, payload)
    state.items.push(installed)
    return installed
  }

  async function remove(skillId) {
    const ok = await skillsApi.deleteSkill(agentId, skillId)
    if (!ok) return false
    const idx = state.items.findIndex((item) => item.id === skillId)
    if (idx >= 0) state.items.splice(idx, 1)
    return true
  }

  return {
    state,
    refresh,
    install,
    remove,
  }
}
