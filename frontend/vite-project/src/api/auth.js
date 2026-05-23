import { apiFetch, jsonOr } from './http.js'

export async function register(payload) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function login(payload) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  return jsonOr(res)
}

export async function getMe() {
  const res = await apiFetch('/api/auth/me')
  return jsonOr(res)
}
