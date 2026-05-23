import {
  ensureAgentRuntime,
  getMcpInstallRoot,
  newId,
  nowTs,
  readMcpList,
  writeMcpList,
} from './agentExtensionsStore.js'
import { execInContainer } from './hermes.js'

const MCP_SOURCE_TYPES = new Set(['custom', 'npm', 'pip', 'git'])

function normalizeArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}

function normalizeEnv(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (!k) continue
    out[String(k)] = String(v ?? '')
  }
  return out
}

function safeName(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function toPublic(item) {
  return {
    id: item.id,
    name: item.name,
    sourceType: item.sourceType,
    status: item.status || 'created',
    command: item.command || '',
    args: Array.isArray(item.args) ? item.args : [],
    env: item.env || {},
    packageName: item.packageName || '',
    version: item.version || '',
    gitUrl: item.gitUrl || '',
    gitRef: item.gitRef || '',
    workdir: item.workdir || '',
    installDir: item.installDir || '',
    lastInstallAt: item.lastInstallAt || null,
    lastError: item.lastError || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function ensureSourceType(sourceType) {
  const normalized = String(sourceType || '').trim().toLowerCase()
  if (!MCP_SOURCE_TYPES.has(normalized)) {
    throw new Error('invalid sourceType, expected custom/npm/pip/git')
  }
  return normalized
}

function validateBySource(input) {
  if (input.sourceType === 'custom' && !input.command) {
    throw new Error('custom source requires command')
  }
  if (input.sourceType === 'npm' && !input.packageName) {
    throw new Error('npm source requires packageName')
  }
  if (input.sourceType === 'pip' && !input.packageName) {
    throw new Error('pip source requires packageName')
  }
  if (input.sourceType === 'git' && !input.gitUrl) {
    throw new Error('git source requires gitUrl')
  }
}

function normalizeInput(body, fallbackName = '未命名 MCP') {
  const sourceType = ensureSourceType(body?.sourceType)
  const normalized = {
    sourceType,
    name: safeName(body?.name, fallbackName),
    command: String(body?.command || '').trim(),
    args: normalizeArray(body?.args),
    env: normalizeEnv(body?.env),
    packageName: String(body?.packageName || '').trim(),
    version: String(body?.version || '').trim(),
    gitUrl: String(body?.gitUrl || '').trim(),
    gitRef: String(body?.gitRef || '').trim(),
    workdir: String(body?.workdir || '').trim(),
  }
  validateBySource(normalized)
  return normalized
}

function packageSpec(item) {
  if (!item.version) return item.packageName
  return `${item.packageName}@${item.version}`
}

export async function listMcp(agentId) {
  const list = await readMcpList(agentId)
  return list.map(toPublic)
}

export async function createMcp(agentId, body) {
  const input = normalizeInput(body)
  const list = await readMcpList(agentId)
  const ts = nowTs()
  const id = newId()
  const installDir = `${getMcpInstallRoot()}/${id}`
  const record = {
    id,
    ...input,
    status: 'created',
    installDir,
    createdAt: ts,
    updatedAt: ts,
    lastInstallAt: null,
    lastError: '',
  }
  list.push(record)
  await writeMcpList(agentId, list)
  return toPublic(record)
}

export async function updateMcp(agentId, mcpId, body) {
  const list = await readMcpList(agentId)
  const index = list.findIndex((item) => item.id === mcpId)
  if (index < 0) return null
  const current = list[index]
  const input = normalizeInput({ ...current, ...body }, current.name)
  const merged = {
    ...current,
    ...input,
    updatedAt: nowTs(),
  }
  list[index] = merged
  await writeMcpList(agentId, list)
  return toPublic(merged)
}

export async function deleteMcp(agentId, mcpId) {
  const list = await readMcpList(agentId)
  const index = list.findIndex((item) => item.id === mcpId)
  if (index < 0) return false
  list.splice(index, 1)
  await writeMcpList(agentId, list)
  return true
}

async function runInstall(containerName, item) {
  if (item.sourceType === 'custom') {
    const checkCmd = `command -v ${item.command.split(/\s+/)[0]} >/dev/null 2>&1`
    await execInContainer(containerName, ['bash', '-lc', checkCmd])
    return
  }

  if (item.sourceType === 'npm') {
    const pkg = packageSpec(item)
    await execInContainer(containerName, ['bash', '-lc', `npm install -g ${pkg}`])
    if (!item.command) {
      item.command = 'npx'
      item.args = ['-y', pkg]
    }
    return
  }

  if (item.sourceType === 'pip') {
    const pkg = packageSpec(item)
    const venvDir = `${item.installDir}/venv`
    const command = [
      'mkdir -p',
      JSON.stringify(item.installDir),
      '&& python3 -m venv',
      JSON.stringify(venvDir),
      '&&',
      `${venvDir}/bin/pip install --upgrade pip`,
      '&&',
      `${venvDir}/bin/pip install ${pkg}`,
    ].join(' ')
    await execInContainer(containerName, ['bash', '-lc', command])
    if (!item.command) {
      item.command = `${venvDir}/bin/python`
      item.args = ['-m', item.packageName]
    }
    return
  }

  if (item.sourceType === 'git') {
    const repoDir = `${item.installDir}/repo`
    const base = `mkdir -p ${JSON.stringify(item.installDir)} && rm -rf ${JSON.stringify(repoDir)} && git clone ${JSON.stringify(item.gitUrl)} ${JSON.stringify(repoDir)}`
    const withRef = item.gitRef
      ? `${base} && cd ${JSON.stringify(repoDir)} && git checkout ${JSON.stringify(item.gitRef)}`
      : base
    await execInContainer(containerName, ['bash', '-lc', withRef])
    if (!item.command) {
      item.command = 'bash'
      item.args = ['-lc', `cd ${repoDir} && ls`]
    }
  }
}

async function runUninstall(containerName, item) {
  if (item.sourceType === 'npm' && item.packageName) {
    await execInContainer(containerName, ['bash', '-lc', `npm uninstall -g ${item.packageName}`]).catch(() => {})
  }
  if (item.sourceType === 'git' || item.sourceType === 'pip') {
    await execInContainer(containerName, ['bash', '-lc', `rm -rf ${JSON.stringify(item.installDir)}`]).catch(() => {})
  }
}

export async function installMcp(agentId, mcpId) {
  const list = await readMcpList(agentId)
  const index = list.findIndex((item) => item.id === mcpId)
  if (index < 0) return null
  const item = { ...list[index] }
  const { containerName } = await ensureAgentRuntime(agentId)
  await execInContainer(containerName, ['mkdir', '-p', getMcpInstallRoot()])
  try {
    await runInstall(containerName, item)
    item.status = 'installed'
    item.lastError = ''
    item.lastInstallAt = nowTs()
  } catch (err) {
    item.status = 'failed'
    item.lastError = err?.message || String(err)
    item.updatedAt = nowTs()
    list[index] = item
    await writeMcpList(agentId, list)
    throw err
  }
  item.updatedAt = nowTs()
  list[index] = item
  await writeMcpList(agentId, list)
  return toPublic(item)
}

export async function uninstallMcp(agentId, mcpId) {
  const list = await readMcpList(agentId)
  const index = list.findIndex((item) => item.id === mcpId)
  if (index < 0) return null
  const item = { ...list[index] }
  const { containerName } = await ensureAgentRuntime(agentId)
  await runUninstall(containerName, item)
  item.status = 'created'
  item.updatedAt = nowTs()
  list[index] = item
  await writeMcpList(agentId, list)
  return toPublic(item)
}
