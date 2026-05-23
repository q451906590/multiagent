import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  deleteDelegationKey,
  getDelegationKeyByHash,
  getDelegationKeyById,
  insertDelegationKey,
  listDelegationKeysByAgent,
  recordDelegationKeyUsage,
  revokeDelegationKey,
} from '../db.js'

function now() {
  return Date.now()
}

function hashAk(plain) {
  return createHash('sha256').update(String(plain)).digest('hex')
}

function buildAkParts() {
  const prefix = randomBytes(4).toString('hex')
  const secret = randomBytes(18).toString('base64url')
  return { prefix, secret }
}

export function toPublicDelegationKey(item) {
  return {
    id: item.id,
    agentId: item.agentId,
    keyPrefix: item.keyPrefix,
    note: item.note || '',
    expiresAt: item.expiresAt,
    revokedAt: item.revokedAt,
    lastUsedAt: item.lastUsedAt,
    useCount: Number(item.useCount ?? 0) || 0,
    lastCallerId: item.lastCallerId || '',
    createdAt: item.createdAt,
  }
}

export function listAgentDelegationKeys(agentId) {
  return listDelegationKeysByAgent(agentId).map(toPublicDelegationKey)
}

export function createAgentDelegationKey(agentId, { note = '', expiresAt } = {}) {
  const { prefix, secret } = buildAkParts()
  const plainKey = `ak_${prefix}_${secret}`
  const ts = now()
  const defaultExpiresAt = ts + config.delegationKeyDefaultTtlMs
  const finalExpiresAt = Number.isFinite(Number(expiresAt)) ? Number(expiresAt) : defaultExpiresAt
  const row = {
    id: randomUUID(),
    agentId,
    keyHash: hashAk(plainKey),
    keyPrefix: prefix,
    note: String(note || '').trim(),
    expiresAt: finalExpiresAt,
    revokedAt: null,
    lastUsedAt: null,
    useCount: 0,
    lastCallerId: '',
    createdAt: ts,
  }
  insertDelegationKey(row)
  return {
    key: plainKey,
    meta: toPublicDelegationKey(row),
  }
}

export function revokeAgentDelegationKey(agentId, keyId) {
  const existing = getDelegationKeyById(keyId)
  if (!existing || existing.agentId !== agentId) return false
  if (!existing.revokedAt) {
    revokeDelegationKey(keyId, now())
  }
  return true
}

export function removeAgentDelegationKey(agentId, keyId) {
  const existing = getDelegationKeyById(keyId)
  if (!existing || existing.agentId !== agentId) return false
  deleteDelegationKey(keyId)
  return true
}

export function parseBearerToken(authHeader) {
  const raw = String(authHeader || '').trim()
  if (!raw) return ''
  const m = raw.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

export function verifyDelegationKey(rawToken, { expectedAgentId, expectedUserId } = {}) {
  const token = String(rawToken || '').trim()
  if (!token) throw new Error('missing delegation key')
  if (!/^ak_[A-Za-z0-9]+_[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('invalid delegation key format')
  }
  const keyHash = hashAk(token)
  const existing = getDelegationKeyByHash(keyHash)
  if (!existing) throw new Error('delegation key not found')
  if (expectedAgentId && existing.agentId !== expectedAgentId) {
    throw new Error('delegation key does not match target agent')
  }
  if (expectedUserId) {
    const uid = String(expectedUserId || '').trim()
    if (!uid || existing.ownerUserId !== uid) {
      throw new Error('delegation key does not belong to current user')
    }
  }
  if (existing.revokedAt) throw new Error('delegation key revoked')
  if (existing.expiresAt && existing.expiresAt <= now()) {
    throw new Error('delegation key expired')
  }
  return existing
}

export function markDelegationKeyUsed(keyId, callerId) {
  recordDelegationKeyUsage(keyId, { usedAt: now(), callerId })
}
