import {
  ensureAgentRuntime,
  getMcpInstallRoot,
  newId,
  nowTs,
  readMcpList,
  writeMcpList,
} from './agentExtensionsStore.js'
import { execInContainer } from './hermes.js'
import { readHermesConfig, writeHermesConfigRaw } from './promptFile.js'

const MCP_SOURCE_TYPES = new Set(['custom', 'npm', 'pip', 'git', 'http'])
const HTTP_INSTALL_TIMEOUT_MS = 10_000

function yamlScalar(value) {
  const s = String(value ?? '')
  if (/^[A-Za-z0-9._:/\-]+$/.test(s)) return s
  return JSON.stringify(s)
}

function yamlKey(value) {
  const s = String(value ?? '')
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(s)) return s
  return JSON.stringify(s)
}

function toServerKey(name, id) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (base) return base
  const tail = String(id || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
  return `mcp_${tail || 'server'}`
}

function stripTopLevelBlock(content, key) {
  const lines = String(content || '').split('\n')
  const out = []
  let skipping = false
  const targetRegex = new RegExp(`^${key}:\\s*(#.*)?$`)
  const topLevelKeyRegex = /^[^\s#][^:]*:\s*(#.*)?$/
  for (const line of lines) {
    if (!skipping && targetRegex.test(line.trim())) {
      skipping = true
      continue
    }
    if (skipping) {
      if (topLevelKeyRegex.test(line)) {
        skipping = false
      } else {
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

function buildMcpServersBlock(items) {
  const installed = (Array.isArray(items) ? items : []).filter((item) => item?.status === 'installed')
  if (!installed.length) return ''

  const lines = ['mcp_servers:']
  const used = new Set()
  for (const item of installed) {
    const isHttp = item?.sourceType === 'http'
    const hasHttp = isHttp && !!item?.httpUrl
    const hasCommand = !isHttp && !!item?.command
    if (!hasHttp && !hasCommand) continue

    let key = toServerKey(item?.name, item?.id)
    let i = 2
    while (used.has(key)) {
      key = `${toServerKey(item?.name, item?.id)}_${i}`
      i += 1
    }
    used.add(key)
    lines.push(`  ${yamlKey(key)}:`)

    if (isHttp) {
      lines.push(`    url: ${yamlScalar(item.httpUrl)}`)
      const headers = normalizeHeaders(item?.headers)
      if (Object.keys(headers).length) {
        lines.push('    headers:')
        for (const [hKey, hValue] of Object.entries(headers)) {
          lines.push(`      ${yamlKey(hKey)}: ${yamlScalar(hValue)}`)
        }
      }
      continue
    }

    lines.push(`    command: ${yamlScalar(item.command)}`)
    const args = normalizeArray(item?.args)
    if (args.length) {
      lines.push(`    args: [${args.map((arg) => yamlScalar(arg)).join(', ')}]`)
    }
    const env = normalizeEnv(item?.env)
    if (Object.keys(env).length) {
      lines.push('    env:')
      for (const [envKey, envValue] of Object.entries(env)) {
        lines.push(`      ${yamlKey(envKey)}: ${yamlScalar(envValue)}`)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

async function syncMcpServersToHermesConfig(agentId, list) {
  let existing = ''
  try {
    existing = await readHermesConfig(agentId)
  } catch (_) {
    existing = ''
  }
  const contentWithoutMcp = stripTopLevelBlock(existing, 'mcp_servers').trimEnd()
  const mcpBlock = buildMcpServersBlock(list)
  const merged = mcpBlock
    ? `${contentWithoutMcp}${contentWithoutMcp ? '\n\n' : ''}${mcpBlock}`.replace(/\n*$/, '\n')
    : `${contentWithoutMcp}\n`
  await writeHermesConfigRaw(agentId, merged)
}

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

function normalizeHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    const key = String(k || '').trim()
    if (!key) continue
    out[key] = String(v ?? '')
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
    headers: item.headers || {},
    packageName: item.packageName || '',
    version: item.version || '',
    gitUrl: item.gitUrl || '',
    httpUrl: item.httpUrl || '',
    url: item.httpUrl || '',
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
    throw new Error('invalid sourceType, expected custom/npm/pip/git/http')
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
  if (input.sourceType === 'http' && !input.httpUrl) {
    throw new Error('http source requires httpUrl')
  }
  if (input.sourceType === 'http' && !/^https?:\/\//i.test(input.httpUrl)) {
    throw new Error('httpUrl must start with http:// or https://')
  }
}

function normalizeInput(body, fallbackName = '未命名 MCP') {
  const sourceType = ensureSourceType(body?.sourceType)
  const env = normalizeEnv(body?.env)
  const headers = normalizeHeaders(body?.headers)
  const normalized = {
    sourceType,
    name: safeName(body?.name, fallbackName),
    command: String(body?.command || '').trim(),
    args: normalizeArray(body?.args),
    env: sourceType === 'http' ? {} : env,
    headers: sourceType === 'http' ? headers : {},
    packageName: String(body?.packageName || '').trim(),
    version: String(body?.version || '').trim(),
    gitUrl: String(body?.gitUrl || '').trim(),
    httpUrl: String(body?.httpUrl ?? body?.url ?? '').trim(),
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

async function verifyHttpEndpoint(item) {
  const url = String(item?.httpUrl || '').trim()
  if (!url) {
    throw new Error('http source requires httpUrl')
  }

  const headers = {
    Accept: 'application/json, text/event-stream;q=0.9, */*;q=0.8',
    ...normalizeHeaders(item?.headers),
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_INSTALL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) {
      // Some MCP stream endpoints reject GET with 405 but are still valid.
      if (res.status === 405) {
        try { await res.body?.cancel?.() } catch (_) {}
        return
      }
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 400).trim()
      } catch (_) {
        detail = ''
      }
      throw new Error(
        detail
          ? `http check failed: ${res.status} ${res.statusText} - ${detail}`
          : `http check failed: ${res.status} ${res.statusText}`
      )
    }
    try { await res.body?.cancel?.() } catch (_) {}
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`http check timeout after ${HTTP_INSTALL_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function listMcp(agentId) {
  const list = await readMcpList(agentId)
  await syncMcpServersToHermesConfig(agentId, list)
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
  await syncMcpServersToHermesConfig(agentId, list)
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
  await syncMcpServersToHermesConfig(agentId, list)
  return toPublic(merged)
}

export async function deleteMcp(agentId, mcpId) {
  const list = await readMcpList(agentId)
  const index = list.findIndex((item) => item.id === mcpId)
  if (index < 0) return false
  list.splice(index, 1)
  await writeMcpList(agentId, list)
  await syncMcpServersToHermesConfig(agentId, list)
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

  if (item.sourceType === 'http') {
    await verifyHttpEndpoint(item)
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
    await syncMcpServersToHermesConfig(agentId, list)
    throw err
  }
  item.updatedAt = nowTs()
  list[index] = item
  await writeMcpList(agentId, list)
  await syncMcpServersToHermesConfig(agentId, list)
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
  await syncMcpServersToHermesConfig(agentId, list)
  return toPublic(item)
}
