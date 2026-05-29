import { config } from '../config.js'
import {
  containerNameFor,
  execInContainer,
  readArchiveFromContainer,
  writeFileToContainer,
  writeArchiveToContainer,
} from './hermes.js'
import { readHermesConfig, readHermesEnv } from './promptFile.js'
import { readMcpList, readSkillsList } from './agentExtensionsStore.js'

const SNAPSHOT_DIRS = ['multiagent', 'skills']

function normalizeLine(value) {
  return String(value || '').replace(/\r\n/g, '\n')
}

export function parseEnvLines(content) {
  const lines = normalizeLine(content).split('\n')
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

export function parseEnvPairs(content) {
  const pairs = []
  for (const line of parseEnvLines(content)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1)
    if (!key) continue
    pairs.push({ key, value })
  }
  return pairs
}

export function sanitizeHermesEnv(content) {
  const pairs = parseEnvPairs(content)
  const keys = []
  for (const pair of pairs) {
    const key = String(pair.key || '').trim()
    if (!key) continue
    keys.push(key)
  }
  const uniqueKeys = [...new Set(keys)]
  const normalized = uniqueKeys.length > 0
    ? `${uniqueKeys.map((key) => `${key}=`).join('\n')}\n`
    : ''
  return { content: normalized, missingKeys: uniqueKeys }
}

const SENSITIVE_KEY_PATTERN = /(token|api[_-]?key|secret|password|authorization|access[_-]?key|private[_-]?key)/i
const DELIVERY_KEY_PATTERN = /(deliver|deliverable|inputDeliverable|resultDeliverable|uploadedFiles|imports?)/i

function sanitizeJsonLike(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonLike(item))
  }
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, raw] of Object.entries(value)) {
    if (DELIVERY_KEY_PATTERN.test(key)) continue
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = ''
      continue
    }
    out[key] = sanitizeJsonLike(raw)
  }
  return out
}

export async function buildTemplateSnapshot(agentId) {
  const [hermesConfig, hermesEnv, mcpList, skillsList] = await Promise.all([
    readHermesConfig(agentId),
    readHermesEnv(agentId),
    readMcpList(agentId),
    readSkillsList(agentId),
  ])
  const envSnapshot = sanitizeHermesEnv(hermesEnv)
  return {
    hermesConfig: normalizeLine(hermesConfig),
    hermesEnvSanitized: envSnapshot.content,
    hermesMissingKeys: envSnapshot.missingKeys,
    mcpList: sanitizeJsonLike(mcpList),
    skillsList: sanitizeJsonLike(skillsList),
  }
}

export async function cloneRuntimeDirsBetweenAgents({ fromAgentId, toAgentId }) {
  const sourceContainer = containerNameFor(fromAgentId)
  const targetContainer = containerNameFor(toAgentId)
  for (const dir of SNAPSHOT_DIRS) {
    const sourcePath = `${config.hermesHomeInContainer}/${dir}`
    const targetRoot = config.hermesHomeInContainer
    const existsResult = await execInContainer(sourceContainer, [
      'bash',
      '-lc',
      `[ -d ${JSON.stringify(sourcePath)} ] && echo yes || echo no`,
    ])
    const exists = String(existsResult?.stdout || '').trim() === 'yes'
    if (!exists) continue
    const archive = await readArchiveFromContainer(sourceContainer, sourcePath)
    await writeArchiveToContainer(targetContainer, archive, targetRoot)
  }
}

export async function writeSnapshotCoreFiles({ toAgentId, agentsMd, hermesConfig, hermesEnvSanitized }) {
  const targetContainer = containerNameFor(toAgentId)
  const contentAgents = normalizeLine(agentsMd || '')
  const contentConfig = normalizeLine(hermesConfig || '')
  const contentEnv = normalizeLine(hermesEnvSanitized || '')
  await writeFileToContainer(targetContainer, config.hermesHomeInContainer, 'AGENTS.md', contentAgents)
  await writeFileToContainer(targetContainer, config.hermesHomeInContainer, 'config.yaml', contentConfig)
  await writeFileToContainer(targetContainer, config.hermesHomeInContainer, '.env', contentEnv)
}
