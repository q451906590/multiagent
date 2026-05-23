import { reactive } from 'vue'
import * as agentsApi from '../api/agents.js'

const state = reactive({
  agents: [],
  loaded: false,
  loading: false,
  bootstrapping: false,
  error: null,
})

let loadPromise = null

async function ensureLoaded() {
  if (state.loaded) return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    state.loading = true
    state.error = null
    try {
      state.bootstrapping = true
      try {
        await agentsApi.bootstrap()
      } catch (err) {
        console.warn('[useAgents] bootstrap failed:', err)
      } finally {
        state.bootstrapping = false
      }

      const list = await agentsApi.listAgents()
      state.agents.splice(0, state.agents.length, ...list)
      state.loaded = true
    } catch (err) {
      state.error = err?.message || String(err)
    } finally {
      state.loading = false
      loadPromise = null
    }
  })()
  return loadPromise
}

function reset() {
  state.agents.splice(0, state.agents.length)
  state.loaded = false
  state.loading = false
  state.bootstrapping = false
  state.error = null
  loadPromise = null
}

async function addAgent(payload) {
  const created = await agentsApi.createAgent(payload)
  state.agents.push(created)
  return created
}

async function editAgent(id, payload) {
  const nextPayload = { ...(payload || {}) }
  const hasHermesConfig = typeof nextPayload.hermesConfigYaml === 'string'
  const hermesConfigYaml = hasHermesConfig ? nextPayload.hermesConfigYaml : null
  const shouldUpdateHermesConfig = Boolean(nextPayload.hermesConfigEdited) && hasHermesConfig
  const hasHermesEnv = typeof nextPayload.hermesEnvFile === 'string'
  const hermesEnvFile = hasHermesEnv ? nextPayload.hermesEnvFile : null
  const shouldUpdateHermesEnv = Boolean(nextPayload.hermesEnvEdited) && hasHermesEnv
  delete nextPayload.hermesConfigEdited
  delete nextPayload.hermesEnvEdited
  if (hasHermesConfig) delete nextPayload.hermesConfigYaml
  if (hasHermesEnv) delete nextPayload.hermesEnvFile

  const updated = await agentsApi.updateAgent(id, nextPayload)
  if (shouldUpdateHermesConfig) {
    await agentsApi.updateAgentHermesConfig(id, { content: hermesConfigYaml })
  }
  if (shouldUpdateHermesEnv) {
    await agentsApi.updateAgentHermesEnv(id, { content: hermesEnvFile })
  }
  const idx = state.agents.findIndex((a) => a.id === id)
  if (idx >= 0) {
    const old = state.agents[idx]
    state.agents.splice(idx, 1, {
      ...old,
      ...updated,
      messages: old.messages || [],
    })
  }
  return updated
}

async function removeAgent(id) {
  const ok = await agentsApi.deleteAgent(id)
  if (ok) {
    const idx = state.agents.findIndex((a) => a.id === id)
    if (idx >= 0) state.agents.splice(idx, 1)
  }
  return ok
}

function getAgent(id) {
  return state.agents.find((a) => a.id === id) || null
}

export function useAgents() {
  return {
    agents: state.agents,
    state,
    addAgent,
    editAgent,
    removeAgent,
    getAgent,
    ensureLoaded,
    reset,
  }
}
