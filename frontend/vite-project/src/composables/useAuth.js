import { computed, reactive } from 'vue'
import * as authApi from '../api/auth.js'
import { clearAccessToken, getAccessToken, setAccessToken } from '../api/http.js'

const state = reactive({
  token: getAccessToken(),
  user: null,
  ready: false,
  loading: false,
  error: '',
})

let initPromise = null

async function fetchMe() {
  const user = await authApi.getMe()
  state.user = user || null
  return state.user
}

async function ensureReady() {
  if (state.ready) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (!state.token) {
      state.ready = true
      return
    }
    try {
      await fetchMe()
    } catch (_) {
      clearAccessToken()
      state.token = ''
      state.user = null
    } finally {
      state.ready = true
      initPromise = null
    }
  })()
  return initPromise
}

async function runAuthAction(fn, payload) {
  state.loading = true
  state.error = ''
  try {
    const result = await fn(payload)
    const token = String(result?.token || '').trim()
    const user = result?.user || null
    if (!token || !user) throw new Error('invalid auth response')
    setAccessToken(token)
    state.token = token
    state.user = user
    state.ready = true
    return user
  } catch (err) {
    state.error = err?.message || String(err)
    throw err
  } finally {
    state.loading = false
  }
}

async function login(credentials) {
  return runAuthAction(authApi.login, credentials)
}

async function register(credentials) {
  return runAuthAction(authApi.register, credentials)
}

function logout() {
  clearAccessToken()
  state.token = ''
  state.user = null
  state.error = ''
  state.ready = true
}

ensureReady()

export function useAuth() {
  return {
    state,
    isAuthenticated: computed(() => Boolean(state.token && state.user)),
    ensureReady,
    login,
    register,
    logout,
    fetchMe,
  }
}
