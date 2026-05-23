const TOKEN_STORAGE_KEY = 'multiagent.accessToken'

export function getAccessToken() {
  if (typeof window === 'undefined') return ''
  return String(window.localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim()
}

export function setAccessToken(token) {
  if (typeof window === 'undefined') return
  const value = String(token || '').trim()
  if (!value) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(TOKEN_STORAGE_KEY, value)
}

export function clearAccessToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function toAuthedUrl(rawUrl) {
  const token = getAccessToken()
  if (!token) return rawUrl
  try {
    const target = new URL(String(rawUrl || ''), window.location.origin)
    if (target.origin !== window.location.origin) return rawUrl
    target.searchParams.set('token', token)
    return `${target.pathname}${target.search}${target.hash}`
  } catch (_) {
    return rawUrl
  }
}

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAccessToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(url, {
    ...options,
    headers,
  })
}

export async function jsonOr(res) {
  let data = null
  try { data = await res.json() } catch (_) { /* noop */ }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `${res.status} ${res.statusText}`)
    err.status = res.status
    throw err
  }
  return data
}
