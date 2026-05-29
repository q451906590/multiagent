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
  const hasColumn = (name) => columns.some((col) => col?.name === name)
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
  if (!hasColumn('source_template_id')) {
    db.exec('ALTER TABLE agents ADD COLUMN source_template_id TEXT')
  }
  if (!hasColumn('source_template_version')) {
    db.exec('ALTER TABLE agents ADD COLUMN source_template_version TEXT')
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_templates (
      id                  TEXT PRIMARY KEY,
      publisher_user_id   TEXT NOT NULL,
      source_agent_id     TEXT NOT NULL,
      title               TEXT NOT NULL,
      slug                TEXT NOT NULL UNIQUE,
      description         TEXT,
      emoji               TEXT,
      role                TEXT,
      system_prompt       TEXT NOT NULL,
      agents_md           TEXT,
      model               TEXT NOT NULL,
      hermes_config       TEXT,
      hermes_env_sanitized TEXT,
      hermes_missing_keys TEXT,
      mcp_json            TEXT,
      skills_json         TEXT,
      tags_json           TEXT,
      visibility          TEXT NOT NULL DEFAULT 'public',
      status              TEXT NOT NULL DEFAULT 'published',
      install_count       INTEGER NOT NULL DEFAULT 0,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_templates_publisher ON agent_templates(publisher_user_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_templates_status_visibility ON agent_templates(status, visibility, created_at DESC)')
  const templateColumns = db.prepare('PRAGMA table_info(agent_templates)').all()
  if (!templateColumns.some((col) => col?.name === 'tags_json')) {
    db.exec('ALTER TABLE agent_templates ADD COLUMN tags_json TEXT')
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_tags (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_tags_name ON marketplace_tags(name)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_tags_created_at ON marketplace_tags(created_at DESC)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_installations (
      id                  TEXT PRIMARY KEY,
      template_id         TEXT NOT NULL,
      user_id             TEXT NOT NULL,
      agent_id            TEXT NOT NULL,
      installed_version   TEXT,
      created_at          INTEGER NOT NULL
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_installations_template ON agent_installations(template_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_installations_user ON agent_installations(user_id, created_at DESC)')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_installations_template_user_agent ON agent_installations(template_id, user_id, agent_id)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      name                TEXT NOT NULL,
      description         TEXT,
      canvas_definition   TEXT NOT NULL,
      n8n_definition      TEXT,
      n8n_workflow_id     TEXT,
      publish_status      TEXT NOT NULL DEFAULT 'draft',
      version             INTEGER NOT NULL DEFAULT 1,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    );
  `)
  const workflowColumns = db.prepare('PRAGMA table_info(workflows)').all()
  if (!workflowColumns.some((col) => col?.name === 'source_template_id')) {
    db.exec('ALTER TABLE workflows ADD COLUMN source_template_id TEXT')
  }
  if (!workflowColumns.some((col) => col?.name === 'source_template_version')) {
    db.exec('ALTER TABLE workflows ADD COLUMN source_template_version TEXT')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflows_user_id_updated_at ON workflows(user_id, updated_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflows_source_template_id ON workflows(source_template_id)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id                    TEXT PRIMARY KEY,
      publisher_user_id     TEXT NOT NULL,
      source_workflow_id    TEXT NOT NULL,
      title                 TEXT NOT NULL,
      slug                  TEXT NOT NULL UNIQUE,
      description           TEXT,
      canvas_definition     TEXT NOT NULL,
      agent_dependencies_json TEXT,
      tags_json             TEXT,
      visibility            TEXT NOT NULL DEFAULT 'public',
      status                TEXT NOT NULL DEFAULT 'published',
      install_count         INTEGER NOT NULL DEFAULT 0,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_templates_publisher ON workflow_templates(publisher_user_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_templates_status_visibility ON workflow_templates(status, visibility, created_at DESC)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_installations (
      id                    TEXT PRIMARY KEY,
      template_id           TEXT NOT NULL,
      user_id               TEXT NOT NULL,
      workflow_id           TEXT NOT NULL,
      installed_version     TEXT,
      created_at            INTEGER NOT NULL
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_installations_template ON workflow_installations(template_id, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_installations_user ON workflow_installations(user_id, created_at DESC)')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_installations_template_user_workflow ON workflow_installations(template_id, user_id, workflow_id)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id                  TEXT PRIMARY KEY,
      workflow_id         TEXT NOT NULL,
      user_id             TEXT NOT NULL,
      n8n_execution_id    TEXT,
      trigger_source      TEXT,
      status              TEXT NOT NULL,
      input_json          TEXT,
      output_json         TEXT,
      error_message       TEXT,
      started_at          INTEGER NOT NULL,
      finished_at         INTEGER
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id_started_at ON workflow_runs(workflow_id, started_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id_started_at ON workflow_runs(user_id, started_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_runs_n8n_execution_id ON workflow_runs(n8n_execution_id)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_run_events (
      id                  TEXT PRIMARY KEY,
      run_id              TEXT NOT NULL,
      workflow_id         TEXT NOT NULL,
      user_id             TEXT NOT NULL,
      node_id             TEXT,
      event_type          TEXT NOT NULL,
      event_status        TEXT,
      payload_json        TEXT,
      error_message       TEXT,
      created_at          INTEGER NOT NULL
    );
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_run_events_run_id_created_at ON workflow_run_events(run_id, created_at ASC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_run_events_workflow_id_created_at ON workflow_run_events(workflow_id, created_at ASC)')
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
    sourceTemplateId: row.source_template_id || '',
    sourceTemplateVersion: row.source_template_version || '',
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
      `INSERT INTO agents (
        id, user_id, name, emoji, role, system_prompt, agents_md, model, container_id,
        host_mount_path, source_template_id, source_template_version, volume_name, created_at
      )
       VALUES (
        @id, @user_id, @name, @emoji, @role, @system_prompt, @agents_md, @model, @container_id,
        @host_mount_path, @source_template_id, @source_template_version, @volume_name, @created_at
      )`
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
      source_template_id: agent.sourceTemplateId || null,
      source_template_version: agent.sourceTemplateVersion || null,
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
    sourceTemplateId: 'source_template_id',
    sourceTemplateVersion: 'source_template_version',
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

function parseJsonArray(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function rowToAgentTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    publisherUserId: row.publisher_user_id,
    publisherUsername: row.publisher_username || '',
    sourceAgentId: row.source_agent_id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    emoji: row.emoji || '',
    role: row.role || '',
    systemPrompt: row.system_prompt,
    agentsMd: row.agents_md || '',
    model: row.model,
    hermesConfig: row.hermes_config || '',
    hermesEnvSanitized: row.hermes_env_sanitized || '',
    hermesMissingKeys: parseJsonArray(row.hermes_missing_keys),
    mcpList: parseJsonArray(row.mcp_json),
    skillsList: parseJsonArray(row.skills_json),
    tagIds: parseJsonArray(row.tags_json),
    visibility: row.visibility || 'public',
    status: row.status || 'published',
    installCount: Number(row.install_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listPublicAgentTemplates() {
  const rows = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.status = 'published' AND t.visibility = 'public'
       ORDER BY t.created_at DESC`
    )
    .all()
  return rows.map(rowToAgentTemplate)
}

function normalizeTagName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24)
}

function rowToMarketplaceTag(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listMarketplaceTags() {
  const rows = getDb()
    .prepare('SELECT * FROM marketplace_tags ORDER BY created_at ASC')
    .all()
  return rows.map(rowToMarketplaceTag)
}

export function getMarketplaceTagById(id) {
  const row = getDb()
    .prepare('SELECT * FROM marketplace_tags WHERE id = ?')
    .get(id)
  return rowToMarketplaceTag(row)
}

export function getMarketplaceTagByName(name) {
  const normalized = normalizeTagName(name)
  if (!normalized) return null
  const row = getDb()
    .prepare('SELECT * FROM marketplace_tags WHERE name = ?')
    .get(normalized)
  return rowToMarketplaceTag(row)
}

export function insertMarketplaceTag(tag) {
  const normalized = normalizeTagName(tag?.name)
  getDb()
    .prepare(
      `INSERT INTO marketplace_tags (id, name, created_at, updated_at)
       VALUES (@id, @name, @created_at, @updated_at)`
    )
    .run({
      id: tag.id,
      name: normalized,
      created_at: tag.createdAt,
      updated_at: tag.updatedAt,
    })
}

export function updateMarketplaceTag(id, fields) {
  const sets = []
  const params = { id }
  if (typeof fields?.name === 'string') {
    sets.push('name = @name')
    params.name = normalizeTagName(fields.name)
  }
  if (typeof fields?.updatedAt === 'number') {
    sets.push('updated_at = @updated_at')
    params.updated_at = fields.updatedAt
  }
  if (sets.length === 0) return
  getDb()
    .prepare(`UPDATE marketplace_tags SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)
}

export function deleteMarketplaceTag(id) {
  getDb().prepare('DELETE FROM marketplace_tags WHERE id = ?').run(id)
}

export function getPublicAgentTemplateById(id) {
  const row = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.id = ? AND t.status = 'published' AND t.visibility = 'public'`
    )
    .get(id)
  return rowToAgentTemplate(row)
}

export function getAgentTemplateById(id) {
  const row = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.id = ?`
    )
    .get(id)
  return rowToAgentTemplate(row)
}

export function getAgentTemplateBySourceAgent(sourceAgentId, publisherUserId) {
  const uid = normalizeUserId(publisherUserId)
  const row = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.source_agent_id = ? AND t.publisher_user_id = ?`
    )
    .get(sourceAgentId, uid)
  return rowToAgentTemplate(row)
}

export function insertAgentTemplate(template) {
  const uid = normalizeUserId(template.publisherUserId)
  getDb()
    .prepare(
      `INSERT INTO agent_templates (
        id, publisher_user_id, source_agent_id, title, slug, description, emoji, role,
        system_prompt, agents_md, model, hermes_config, hermes_env_sanitized, hermes_missing_keys,
        mcp_json, skills_json, tags_json, visibility, status, install_count, created_at, updated_at
      ) VALUES (
        @id, @publisher_user_id, @source_agent_id, @title, @slug, @description, @emoji, @role,
        @system_prompt, @agents_md, @model, @hermes_config, @hermes_env_sanitized, @hermes_missing_keys,
        @mcp_json, @skills_json, @tags_json, @visibility, @status, @install_count, @created_at, @updated_at
      )`
    )
    .run({
      id: template.id,
      publisher_user_id: uid,
      source_agent_id: template.sourceAgentId,
      title: template.title,
      slug: template.slug,
      description: template.description || null,
      emoji: template.emoji || null,
      role: template.role || null,
      system_prompt: template.systemPrompt,
      agents_md: template.agentsMd || null,
      model: template.model,
      hermes_config: template.hermesConfig || null,
      hermes_env_sanitized: template.hermesEnvSanitized || null,
      hermes_missing_keys: JSON.stringify(template.hermesMissingKeys || []),
      mcp_json: JSON.stringify(template.mcpList || []),
      skills_json: JSON.stringify(template.skillsList || []),
      tags_json: JSON.stringify(template.tagIds || []),
      visibility: template.visibility || 'public',
      status: template.status || 'published',
      install_count: Number(template.installCount || 0),
      created_at: template.createdAt,
      updated_at: template.updatedAt,
    })
}

export function updateAgentTemplate(id, fields, publisherUserId) {
  const uid = normalizeUserId(publisherUserId)
  const map = {
    title: 'title',
    slug: 'slug',
    description: 'description',
    emoji: 'emoji',
    role: 'role',
    systemPrompt: 'system_prompt',
    agentsMd: 'agents_md',
    model: 'model',
    hermesConfig: 'hermes_config',
    hermesEnvSanitized: 'hermes_env_sanitized',
    hermesMissingKeys: 'hermes_missing_keys',
    mcpList: 'mcp_json',
    skillsList: 'skills_json',
    tagIds: 'tags_json',
    visibility: 'visibility',
    status: 'status',
    installCount: 'install_count',
    updatedAt: 'updated_at',
  }
  const sets = []
  const params = { id, publisher_user_id: uid }
  for (const [k, v] of Object.entries(fields || {})) {
    const col = map[k]
    if (!col) continue
    sets.push(`${col} = @${col}`)
    if (['hermes_missing_keys', 'mcp_json', 'skills_json', 'tags_json'].includes(col)) {
      params[col] = JSON.stringify(v || [])
    } else {
      params[col] = v
    }
  }
  if (sets.length === 0) return
  getDb()
    .prepare(
      `UPDATE agent_templates
       SET ${sets.join(', ')}
       WHERE id = @id AND publisher_user_id = @publisher_user_id`
    )
    .run(params)
}

export function bumpAgentTemplateInstallCount(templateId) {
  getDb()
    .prepare(
      `UPDATE agent_templates
       SET install_count = COALESCE(install_count, 0) + 1, updated_at = @updated_at
       WHERE id = @id`
    )
    .run({ id: templateId, updated_at: Date.now() })
}

function rowToAgentInstallation(row) {
  if (!row) return null
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    agentId: row.agent_id,
    installedVersion: row.installed_version || '',
    createdAt: row.created_at,
  }
}

export function insertAgentInstallation(installation) {
  const uid = normalizeUserId(installation.userId)
  getDb()
    .prepare(
      `INSERT INTO agent_installations
       (id, template_id, user_id, agent_id, installed_version, created_at)
       VALUES (@id, @template_id, @user_id, @agent_id, @installed_version, @created_at)`
    )
    .run({
      id: installation.id,
      template_id: installation.templateId,
      user_id: uid,
      agent_id: installation.agentId,
      installed_version: installation.installedVersion || null,
      created_at: installation.createdAt,
    })
}

export function listAgentInstallationsByUser(userId) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM agent_installations
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(uid)
  return rows.map(rowToAgentInstallation)
}

export function listImportedAgentsByUser(userId) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT
        i.id AS installation_id,
        i.template_id,
        i.agent_id,
        i.installed_version,
        i.created_at AS installed_at,
        a.name AS agent_name,
        a.emoji AS agent_emoji,
        a.model AS agent_model,
        t.title AS template_title,
        t.tags_json AS template_tags_json,
        u.username AS publisher_username
      FROM agent_installations i
      INNER JOIN agents a ON a.id = i.agent_id
      LEFT JOIN agent_templates t ON t.id = i.template_id
      LEFT JOIN users u ON u.id = t.publisher_user_id
      WHERE i.user_id = @user_id
      ORDER BY i.created_at DESC`
    )
    .all({ user_id: uid })

  return rows.map((row) => ({
    id: row.installation_id,
    templateId: row.template_id,
    agentId: row.agent_id,
    installedVersion: row.installed_version || '',
    installedAt: row.installed_at,
    agentName: row.agent_name || '',
    agentEmoji: row.agent_emoji || '🤖',
    agentModel: row.agent_model || '',
    templateTitle: row.template_title || '',
    publisherUsername: row.publisher_username || '',
    tagIds: parseJsonArray(row.template_tags_json),
  }))
}

function rowToWorkflowTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    publisherUserId: row.publisher_user_id,
    publisherUsername: row.publisher_username || '',
    sourceWorkflowId: row.source_workflow_id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    canvasDefinition: parseJsonObject(row.canvas_definition) || { nodes: [], edges: [] },
    agentDependencies: parseJsonArray(row.agent_dependencies_json),
    tagIds: parseJsonArray(row.tags_json),
    visibility: row.visibility || 'public',
    status: row.status || 'published',
    installCount: Number(row.install_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listPublicWorkflowTemplates() {
  const rows = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM workflow_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.status = 'published' AND t.visibility = 'public'
       ORDER BY t.created_at DESC`
    )
    .all()
  return rows.map(rowToWorkflowTemplate)
}

export function getWorkflowTemplateById(id) {
  const row = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM workflow_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.id = ?`
    )
    .get(id)
  return rowToWorkflowTemplate(row)
}

export function getWorkflowTemplateBySourceWorkflow(sourceWorkflowId, publisherUserId) {
  const uid = normalizeUserId(publisherUserId)
  const row = getDb()
    .prepare(
      `SELECT t.*, u.username AS publisher_username
       FROM workflow_templates t
       LEFT JOIN users u ON u.id = t.publisher_user_id
       WHERE t.source_workflow_id = ? AND t.publisher_user_id = ?`
    )
    .get(sourceWorkflowId, uid)
  return rowToWorkflowTemplate(row)
}

export function insertWorkflowTemplate(template) {
  const uid = normalizeUserId(template.publisherUserId)
  getDb()
    .prepare(
      `INSERT INTO workflow_templates (
        id, publisher_user_id, source_workflow_id, title, slug, description, canvas_definition,
        agent_dependencies_json, tags_json, visibility, status, install_count, created_at, updated_at
      ) VALUES (
        @id, @publisher_user_id, @source_workflow_id, @title, @slug, @description, @canvas_definition,
        @agent_dependencies_json, @tags_json, @visibility, @status, @install_count, @created_at, @updated_at
      )`
    )
    .run({
      id: template.id,
      publisher_user_id: uid,
      source_workflow_id: template.sourceWorkflowId,
      title: template.title,
      slug: template.slug,
      description: template.description || null,
      canvas_definition: JSON.stringify(template.canvasDefinition || { nodes: [], edges: [] }),
      agent_dependencies_json: JSON.stringify(template.agentDependencies || []),
      tags_json: JSON.stringify(template.tagIds || []),
      visibility: template.visibility || 'public',
      status: template.status || 'published',
      install_count: Number(template.installCount || 0),
      created_at: template.createdAt,
      updated_at: template.updatedAt,
    })
}

export function updateWorkflowTemplate(id, fields, publisherUserId) {
  const uid = normalizeUserId(publisherUserId)
  const map = {
    title: 'title',
    slug: 'slug',
    description: 'description',
    canvasDefinition: 'canvas_definition',
    agentDependencies: 'agent_dependencies_json',
    tagIds: 'tags_json',
    visibility: 'visibility',
    status: 'status',
    installCount: 'install_count',
    updatedAt: 'updated_at',
  }
  const sets = []
  const params = { id, publisher_user_id: uid }
  for (const [k, v] of Object.entries(fields || {})) {
    const col = map[k]
    if (!col) continue
    sets.push(`${col} = @${col}`)
    if (['canvas_definition', 'agent_dependencies_json', 'tags_json'].includes(col)) {
      if (col === 'canvas_definition') {
        params[col] = JSON.stringify(v || { nodes: [], edges: [] })
      } else {
        params[col] = JSON.stringify(v || [])
      }
    } else {
      params[col] = v
    }
  }
  if (!sets.length) return
  getDb()
    .prepare(
      `UPDATE workflow_templates
       SET ${sets.join(', ')}
       WHERE id = @id AND publisher_user_id = @publisher_user_id`
    )
    .run(params)
}

export function bumpWorkflowTemplateInstallCount(templateId) {
  getDb()
    .prepare(
      `UPDATE workflow_templates
       SET install_count = COALESCE(install_count, 0) + 1, updated_at = @updated_at
       WHERE id = @id`
    )
    .run({ id: templateId, updated_at: Date.now() })
}

function rowToWorkflowInstallation(row) {
  if (!row) return null
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    installedVersion: row.installed_version || '',
    createdAt: row.created_at,
  }
}

export function insertWorkflowInstallation(installation) {
  const uid = normalizeUserId(installation.userId)
  getDb()
    .prepare(
      `INSERT INTO workflow_installations
       (id, template_id, user_id, workflow_id, installed_version, created_at)
       VALUES (@id, @template_id, @user_id, @workflow_id, @installed_version, @created_at)`
    )
    .run({
      id: installation.id,
      template_id: installation.templateId,
      user_id: uid,
      workflow_id: installation.workflowId,
      installed_version: installation.installedVersion || null,
      created_at: installation.createdAt,
    })
}

export function listWorkflowInstallationsByUser(userId) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM workflow_installations
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(uid)
  return rows.map(rowToWorkflowInstallation)
}

export function listImportedWorkflowsByUser(userId) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT
        i.id AS installation_id,
        i.template_id,
        i.workflow_id,
        i.installed_version,
        i.created_at AS installed_at,
        w.name AS workflow_name,
        w.publish_status AS workflow_status,
        t.title AS template_title,
        t.tags_json AS template_tags_json,
        u.username AS publisher_username
      FROM workflow_installations i
      INNER JOIN workflows w ON w.id = i.workflow_id
      LEFT JOIN workflow_templates t ON t.id = i.template_id
      LEFT JOIN users u ON u.id = t.publisher_user_id
      WHERE i.user_id = @user_id
      ORDER BY i.created_at DESC`
    )
    .all({ user_id: uid })
  return rows.map((row) => ({
    id: row.installation_id,
    templateId: row.template_id,
    workflowId: row.workflow_id,
    installedVersion: row.installed_version || '',
    installedAt: row.installed_at,
    workflowName: row.workflow_name || '',
    workflowStatus: row.workflow_status || '',
    templateTitle: row.template_title || '',
    publisherUsername: row.publisher_username || '',
    tagIds: parseJsonArray(row.template_tags_json),
  }))
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

function parseJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_) {
    return null
  }
}

function rowToWorkflow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || '',
    canvasDefinition: parseJsonObject(row.canvas_definition) || { nodes: [], edges: [] },
    n8nDefinition: parseJsonObject(row.n8n_definition),
    n8nWorkflowId: row.n8n_workflow_id || '',
    sourceTemplateId: row.source_template_id || '',
    sourceTemplateVersion: row.source_template_version || '',
    publishStatus: row.publish_status || 'draft',
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToWorkflowRun(row) {
  if (!row) return null
  return {
    id: row.id,
    workflowId: row.workflow_id,
    userId: row.user_id,
    n8nExecutionId: row.n8n_execution_id || '',
    triggerSource: row.trigger_source || '',
    status: row.status,
    input: parseJsonObject(row.input_json),
    output: parseJsonObject(row.output_json),
    errorMessage: row.error_message || '',
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
  }
}

function rowToWorkflowRunEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    workflowId: row.workflow_id,
    userId: row.user_id,
    nodeId: row.node_id || '',
    eventType: row.event_type,
    eventStatus: row.event_status || '',
    payload: parseJsonObject(row.payload_json),
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
  }
}

export function listWorkflowsByUser(userId) {
  const uid = normalizeUserId(userId)
  return getDb()
    .prepare(
      `SELECT *
       FROM workflows
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    )
    .all(uid)
    .map(rowToWorkflow)
}

export function getWorkflowById(id, userId) {
  const uid = normalizeUserId(userId)
  const row = getDb()
    .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(id, uid)
  return rowToWorkflow(row)
}

export function insertWorkflow(workflow) {
  const uid = normalizeUserId(workflow.userId)
  getDb()
    .prepare(
      `INSERT INTO workflows (
        id, user_id, name, description, canvas_definition, n8n_definition, n8n_workflow_id,
        source_template_id, source_template_version, publish_status, version, created_at, updated_at
      ) VALUES (
        @id, @user_id, @name, @description, @canvas_definition, @n8n_definition, @n8n_workflow_id,
        @source_template_id, @source_template_version, @publish_status, @version, @created_at, @updated_at
      )`
    )
    .run({
      id: workflow.id,
      user_id: uid,
      name: workflow.name,
      description: workflow.description || null,
      canvas_definition: JSON.stringify(workflow.canvasDefinition || { nodes: [], edges: [] }),
      n8n_definition: workflow.n8nDefinition ? JSON.stringify(workflow.n8nDefinition) : null,
      n8n_workflow_id: workflow.n8nWorkflowId || null,
      source_template_id: workflow.sourceTemplateId || null,
      source_template_version: workflow.sourceTemplateVersion || null,
      publish_status: workflow.publishStatus || 'draft',
      version: Number(workflow.version || 1),
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt,
    })
}

export function updateWorkflow(id, userId, fields) {
  const uid = normalizeUserId(userId)
  const map = {
    name: 'name',
    description: 'description',
    canvasDefinition: 'canvas_definition',
    n8nDefinition: 'n8n_definition',
    n8nWorkflowId: 'n8n_workflow_id',
    sourceTemplateId: 'source_template_id',
    sourceTemplateVersion: 'source_template_version',
    publishStatus: 'publish_status',
    version: 'version',
    updatedAt: 'updated_at',
  }
  const sets = []
  const params = { id, user_id: uid }
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined) continue
    const col = map[key]
    if (!col) continue
    sets.push(`${col} = @${col}`)
    if (col === 'canvas_definition' || col === 'n8n_definition') {
      params[col] = value ? JSON.stringify(value) : null
      continue
    }
    params[col] = value
  }
  if (!sets.length) return
  getDb()
    .prepare(
      `UPDATE workflows
       SET ${sets.join(', ')}
       WHERE id = @id AND user_id = @user_id`
    )
    .run(params)
}

export function deleteWorkflow(id, userId) {
  const uid = normalizeUserId(userId)
  getDb().prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').run(id, uid)
}

export function insertWorkflowRun(run) {
  const uid = normalizeUserId(run.userId)
  getDb()
    .prepare(
      `INSERT INTO workflow_runs (
        id, workflow_id, user_id, n8n_execution_id, trigger_source, status,
        input_json, output_json, error_message, started_at, finished_at
      ) VALUES (
        @id, @workflow_id, @user_id, @n8n_execution_id, @trigger_source, @status,
        @input_json, @output_json, @error_message, @started_at, @finished_at
      )`
    )
    .run({
      id: run.id,
      workflow_id: run.workflowId,
      user_id: uid,
      n8n_execution_id: run.n8nExecutionId || null,
      trigger_source: run.triggerSource || null,
      status: run.status,
      input_json: run.input ? JSON.stringify(run.input) : null,
      output_json: run.output ? JSON.stringify(run.output) : null,
      error_message: run.errorMessage || null,
      started_at: run.startedAt,
      finished_at: run.finishedAt ?? null,
    })
}

export function updateWorkflowRun(id, userId, fields) {
  const uid = normalizeUserId(userId)
  const map = {
    n8nExecutionId: 'n8n_execution_id',
    status: 'status',
    input: 'input_json',
    output: 'output_json',
    errorMessage: 'error_message',
    finishedAt: 'finished_at',
  }
  const sets = []
  const params = { id, user_id: uid }
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined) continue
    const col = map[key]
    if (!col) continue
    sets.push(`${col} = @${col}`)
    if (col === 'input_json' || col === 'output_json') {
      params[col] = value ? JSON.stringify(value) : null
      continue
    }
    params[col] = value
  }
  if (!sets.length) return
  getDb()
    .prepare(
      `UPDATE workflow_runs
       SET ${sets.join(', ')}
       WHERE id = @id AND user_id = @user_id`
    )
    .run(params)
}

export function getWorkflowRunById(id, userId) {
  const uid = normalizeUserId(userId)
  const row = getDb()
    .prepare('SELECT * FROM workflow_runs WHERE id = ? AND user_id = ?')
    .get(id, uid)
  return rowToWorkflowRun(row)
}

export function getWorkflowRunByExecutionId(n8nExecutionId) {
  const row = getDb()
    .prepare('SELECT * FROM workflow_runs WHERE n8n_execution_id = ?')
    .get(String(n8nExecutionId || '').trim())
  return rowToWorkflowRun(row)
}

export function listWorkflowRunsByWorkflow(workflowId, userId, { limit = 30 } = {}) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM workflow_runs
       WHERE workflow_id = @workflow_id AND user_id = @user_id
       ORDER BY started_at DESC
       LIMIT @limit`
    )
    .all({
      workflow_id: workflowId,
      user_id: uid,
      limit: Math.max(1, Number(limit || 30)),
    })
  return rows.map(rowToWorkflowRun)
}

export function insertWorkflowRunEvent(event) {
  const uid = normalizeUserId(event.userId)
  getDb()
    .prepare(
      `INSERT INTO workflow_run_events (
        id, run_id, workflow_id, user_id, node_id, event_type, event_status,
        payload_json, error_message, created_at
      ) VALUES (
        @id, @run_id, @workflow_id, @user_id, @node_id, @event_type, @event_status,
        @payload_json, @error_message, @created_at
      )`
    )
    .run({
      id: event.id,
      run_id: event.runId,
      workflow_id: event.workflowId,
      user_id: uid,
      node_id: event.nodeId || null,
      event_type: event.eventType,
      event_status: event.eventStatus || null,
      payload_json: event.payload ? JSON.stringify(event.payload) : null,
      error_message: event.errorMessage || null,
      created_at: event.createdAt,
    })
}

export function listWorkflowRunEvents(runId, userId, { limit = 200 } = {}) {
  const uid = normalizeUserId(userId)
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM workflow_run_events
       WHERE run_id = @run_id AND user_id = @user_id
       ORDER BY created_at ASC
       LIMIT @limit`
    )
    .all({
      run_id: runId,
      user_id: uid,
      limit: Math.max(1, Number(limit || 200)),
    })
  return rows.map(rowToWorkflowRunEvent)
}
