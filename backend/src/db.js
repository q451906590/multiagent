import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

let db = null

function normalizeUserId(userId) {
  const raw = String(userId || '').trim()
  if (!raw) throw new Error('user_id is required')
  return raw
}

export function getDb() {
  if (db) return db
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
  db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      name          TEXT NOT NULL,
      emoji         TEXT,
      role          TEXT,
      system_prompt TEXT NOT NULL,
      agents_md     TEXT,
      model         TEXT NOT NULL,
      container_id  TEXT,
      host_mount_path TEXT,
      volume_name   TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
  `)
  const columns = db.prepare('PRAGMA table_info(agents)').all()
  const hasAgentsMd = columns.some((col) => col?.name === 'agents_md')
  if (!hasAgentsMd) {
    db.exec('ALTER TABLE agents ADD COLUMN agents_md TEXT')
  }
  const hasHostMountPath = columns.some((col) => col?.name === 'host_mount_path')
  if (!hasHostMountPath) {
    db.exec('ALTER TABLE agents ADD COLUMN host_mount_path TEXT')
  }
  const hasAgentUserId = columns.some((col) => col?.name === 'user_id')
  if (!hasAgentUserId) {
    db.exec('ALTER TABLE agents ADD COLUMN user_id TEXT')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_user_id_created_at ON agents(user_id, created_at)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
  `)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_delegation_keys (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL,
      key_hash      TEXT NOT NULL UNIQUE,
      key_prefix    TEXT NOT NULL,
      note          TEXT,
      expires_at    INTEGER,
      revoked_at    INTEGER,
      last_used_at  INTEGER,
      use_count     INTEGER NOT NULL DEFAULT 0,
      last_caller_id TEXT,
      created_at    INTEGER NOT NULL
    );
  `)
  const delegationColumns = db.prepare('PRAGMA table_info(agent_delegation_keys)').all()
  const hasUseCount = delegationColumns.some((col) => col?.name === 'use_count')
  if (!hasUseCount) {
    db.exec('ALTER TABLE agent_delegation_keys ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0')
  }
  const hasLastCallerId = delegationColumns.some((col) => col?.name === 'last_caller_id')
  if (!hasLastCallerId) {
    db.exec('ALTER TABLE agent_delegation_keys ADD COLUMN last_caller_id TEXT')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_delegation_keys_agent_id ON agent_delegation_keys(agent_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_delegation_keys_key_prefix ON agent_delegation_keys(key_prefix)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_delegation_keys_expires_at ON agent_delegation_keys(expires_at)')
  return db
}

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getUserById(id) {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id)
  return rowToUser(row)
}

export function getUserByUsername(username) {
  const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim())
  return rowToUser(row)
}

export function insertUser(user) {
  getDb()
    .prepare(
      `INSERT INTO users (id, username, password_hash, created_at, updated_at)
       VALUES (@id, @username, @password_hash, @created_at, @updated_at)`
    )
    .run({
      id: user.id,
      username: String(user.username || '').trim(),
      password_hash: user.passwordHash,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    })
}

export function assignUnownedResourcesToUser(userId) {
  const uid = normalizeUserId(userId)
  const changes = getDb()
    .prepare("UPDATE agents SET user_id = @user_id WHERE user_id IS NULL OR trim(user_id) = ''")
    .run({ user_id: uid }).changes
  return {
    agents: changes,
  }
}

function rowToAgent(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id || '',
    name: row.name,
    emoji: row.emoji || '',
    role: row.role || '',
    systemPrompt: row.system_prompt,
    agentsMd: row.agents_md || '',
    model: row.model,
    containerId: row.container_id || null,
    hostMountPath: row.host_mount_path || '',
    volumeName: row.volume_name,
    createdAt: row.created_at,
    messages: [],
  }
}

export function listAgents(userId) {
  const uid = normalizeUserId(userId)
  return getDb()
    .prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at ASC')
    .all(uid)
    .map(rowToAgent)
}

export function listAllAgents() {
  return getDb()
    .prepare('SELECT * FROM agents ORDER BY created_at ASC')
    .all()
    .map(rowToAgent)
}

export function getAgent(id, userId) {
  const uid = normalizeUserId(userId)
  const row = getDb().prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(id, uid)
  return rowToAgent(row)
}

export function getAgentById(id) {
  const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id)
  return rowToAgent(row)
}

export function insertAgent(agent) {
  const uid = normalizeUserId(agent.userId)
  getDb()
    .prepare(
      `INSERT INTO agents (id, user_id, name, emoji, role, system_prompt, agents_md, model, container_id, host_mount_path, volume_name, created_at)
       VALUES (@id, @user_id, @name, @emoji, @role, @system_prompt, @agents_md, @model, @container_id, @host_mount_path, @volume_name, @created_at)`
    )
    .run({
      id: agent.id,
      user_id: uid,
      name: agent.name,
      emoji: agent.emoji || '',
      role: agent.role || '',
      system_prompt: agent.systemPrompt,
      agents_md: agent.agentsMd || null,
      model: agent.model,
      container_id: agent.containerId || null,
      host_mount_path: agent.hostMountPath || null,
      volume_name: agent.volumeName,
      created_at: agent.createdAt,
    })
}

export function updateAgentRow(id, fields, userId) {
  const uid = normalizeUserId(userId)
  const map = {
    name: 'name',
    emoji: 'emoji',
    role: 'role',
    systemPrompt: 'system_prompt',
    agentsMd: 'agents_md',
    model: 'model',
    containerId: 'container_id',
    hostMountPath: 'host_mount_path',
  }
  const sets = []
  const params = { id }
  for (const [k, v] of Object.entries(fields)) {
    const col = map[k]
    if (!col) continue
    sets.push(`${col} = @${col}`)
    params[col] = v
  }
  if (sets.length === 0) return
  params.user_id = uid
  getDb()
    .prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = @id AND user_id = @user_id`)
    .run(params)
}

export function deleteAgentRow(id, userId) {
  const uid = normalizeUserId(userId)
  getDb().prepare('DELETE FROM agents WHERE id = ? AND user_id = ?').run(id, uid)
}

function rowToDelegationKey(row) {
  if (!row) return null
  return {
    id: row.id,
    agentId: row.agent_id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    note: row.note || '',
    expiresAt: row.expires_at ?? null,
    revokedAt: row.revoked_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
    useCount: Number(row.use_count ?? 0) || 0,
    lastCallerId: row.last_caller_id || '',
    ownerUserId: row.owner_user_id || row.user_id || '',
    createdAt: row.created_at,
  }
}

export function insertDelegationKey(row) {
  getDb()
    .prepare(
      `INSERT INTO agent_delegation_keys
       (id, agent_id, key_hash, key_prefix, note, expires_at, revoked_at, last_used_at, use_count, last_caller_id, created_at)
       VALUES (@id, @agent_id, @key_hash, @key_prefix, @note, @expires_at, @revoked_at, @last_used_at, @use_count, @last_caller_id, @created_at)`
    )
    .run({
      id: row.id,
      agent_id: row.agentId,
      key_hash: row.keyHash,
      key_prefix: row.keyPrefix,
      note: row.note || null,
      expires_at: row.expiresAt ?? null,
      revoked_at: row.revokedAt ?? null,
      last_used_at: row.lastUsedAt ?? null,
      use_count: Number(row.useCount ?? 0) || 0,
      last_caller_id: String(row.lastCallerId || '').trim() || null,
      created_at: row.createdAt,
    })
}

export function listDelegationKeysByAgent(agentId) {
  return getDb()
    .prepare('SELECT * FROM agent_delegation_keys WHERE agent_id = ? ORDER BY created_at DESC')
    .all(agentId)
    .map(rowToDelegationKey)
}

export function hasActiveDelegationKeyForAgent(agentId, at = Date.now()) {
  const row = getDb()
    .prepare(
      `SELECT 1
       FROM agent_delegation_keys
       WHERE agent_id = @agent_id
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > @now)
       LIMIT 1`
    )
    .get({
      agent_id: agentId,
      now: at,
    })
  return Boolean(row)
}

export function listActiveDelegationAgentIdsByUser(userId, at = Date.now()) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT a.id
       FROM agents a
       INNER JOIN agent_delegation_keys k ON k.agent_id = a.id
       WHERE a.user_id = @user_id
         AND k.revoked_at IS NULL
         AND (k.expires_at IS NULL OR k.expires_at > @now)
       ORDER BY a.created_at ASC`
    )
    .all({
      user_id: uid,
      now: at,
    })
  return rows.map((row) => row.id)
}

export function getDelegationKeyById(id) {
  const row = getDb().prepare(`
    SELECT k.*, a.user_id AS owner_user_id
    FROM agent_delegation_keys k
    INNER JOIN agents a ON a.id = k.agent_id
    WHERE k.id = ?
  `).get(id)
  return rowToDelegationKey(row)
}

export function getDelegationKeyByHash(keyHash) {
  const row = getDb().prepare(`
    SELECT k.*, a.user_id AS owner_user_id
    FROM agent_delegation_keys k
    INNER JOIN agents a ON a.id = k.agent_id
    WHERE k.key_hash = ?
  `).get(keyHash)
  return rowToDelegationKey(row)
}

export function revokeDelegationKey(id, revokedAt) {
  getDb()
    .prepare('UPDATE agent_delegation_keys SET revoked_at = @revoked_at WHERE id = @id')
    .run({ id, revoked_at: revokedAt })
}

export function recordDelegationKeyUsage(id, { usedAt, callerId }) {
  getDb()
    .prepare(
      `UPDATE agent_delegation_keys
       SET last_used_at = @last_used_at,
           last_caller_id = @last_caller_id,
           use_count = COALESCE(use_count, 0) + 1
       WHERE id = @id`
    )
    .run({
      id,
      last_used_at: usedAt,
      last_caller_id: String(callerId || '').trim() || null,
    })
}

export function deleteDelegationKey(id) {
  getDb().prepare('DELETE FROM agent_delegation_keys WHERE id = ?').run(id)
}
