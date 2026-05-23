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
  const keep = []
  const missing = []
  for (const pair of pairs) {
    const key = pair.key.toUpperCase()
    const looksSensitive =
      key.includes('SECRET') ||
      key.includes('TOKEN') ||
      key.includes('PASSWORD') ||
      key.endsWith('_API_KEY') ||
      key.includes('PRIVATE_KEY')
    if (looksSensitive) {
      missing.push(pair.key)
      continue
    }
    keep.push(`${pair.key}=${pair.value}`)
  }
  const normalized = keep.length > 0 ? `${keep.join('\n')}\n` : ''
  return { content: normalized, missingKeys: missing }
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
    mcpList,
    skillsList,
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
