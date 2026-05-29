import { config } from '../config.js'
import { writeFileToContainer, containerNameFor, execInContainer } from './hermes.js'

const PROMPT_FILENAME = 'AGENTS.md'
const HERMES_ENV_FILENAME = '.env'
const HERMES_CONFIG_FILENAME = 'config.yaml'
const WORKSPACE_DIR = config.hermesHomeInContainer
const HERMES_STATE_DIR = config.hermesHomeInContainer
const HERMES_LEGACY_STATE_DIR = `${WORKSPACE_DIR}/.hermes`
const SUBPROCESS_HOME_DIR = config.hermesSubprocessHomeInContainer
const UPLOAD_INBOX_DIR = config.uploadInboxDirInContainer
const DELIVERY_DIR = config.deliveryDirInContainer
const RECEIVED_DIR = config.receivedDirInContainer

export function buildAgentProfileMarkdown({ name, role, systemPrompt, agentsMd }) {
  const customPrompt = typeof agentsMd === 'string' ? agentsMd : ''
  if (customPrompt.trim()) {
    return customPrompt.endsWith('\n') ? customPrompt : `${customPrompt}\n`
  }
  const lines = []
  if (name) lines.push(`# ${name}`)
  if (role) lines.push('', `**Role:** ${role}`)
  lines.push(
    '',
    '## Workspace Rules',
    '',
    `- Your working directory is \`${WORKSPACE_DIR}\`.`,
    `- Hermes state root is \`${HERMES_STATE_DIR}\` (sessions/memories/config live here).`,
    `- Subprocess HOME directory is \`${SUBPROCESS_HOME_DIR}\` (git/ssh/gh/npm and skill CLIs read credentials here).`,
    `- Uploaded input files are placed under \`${UPLOAD_INBOX_DIR}\` (read as input context).`,
    `- Your own output directory is \`${DELIVERY_DIR}\`.`,
    `- Files delivered from other agents are under \`${RECEIVED_DIR}\` (read-only input context).`,
    '- Session-scoped execution must use session subfolders under output/received directories.',
    '- Create and update your deliverable files only under your own output directory.',
    '- Never mix files across different run/chat session folders.',
    '- When you claim a file is generated, provide the relative path under the workspace.',
    '',
    '## System Prompt',
    '',
    String(systemPrompt || '').trim()
  )
  return lines.join('\n') + '\n'
}

function pickEnvForProvider(provider) {
  const keys = []
  switch ((provider || '').toLowerCase()) {
    case 'minimax-cn':
      keys.push('MINIMAX_CN_API_KEY', 'MINIMAX_CN_BASE_URL')
      break
    case 'minimax':
      keys.push('MINIMAX_API_KEY', 'MINIMAX_BASE_URL')
      break
    case 'openrouter':
      keys.push('OPENROUTER_API_KEY')
      break
    case 'openai':
      keys.push('OPENAI_API_KEY', 'OPENAI_BASE_URL')
      break
    case 'anthropic':
    case 'claude':
    case 'claude-code':
      keys.push('ANTHROPIC_API_KEY')
      break
    case 'deepseek':
      keys.push('DEEPSEEK_API_KEY')
      break
    case 'zai':
    case 'glm':
      keys.push('GLM_API_KEY', 'GLM_BASE_URL')
      break
    case 'kimi-coding':
    case 'kimi':
      keys.push('KIMI_API_KEY', 'KIMI_BASE_URL')
      break
    case 'kimi-coding-cn':
    case 'kimi-cn':
    case 'moonshot-cn':
      keys.push('KIMI_CN_API_KEY', 'KIMI_BASE_URL')
      break
    case 'alibaba':
    case 'dashscope':
    case 'qwen':
      keys.push('DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL')
      break
    case 'xiaomi':
    case 'mimo':
    case 'xiaomi-mimo':
      keys.push('XIAOMI_API_KEY', 'XIAOMI_BASE_URL')
      break
    default:
      keys.push(
        'MINIMAX_CN_API_KEY', 'MINIMAX_CN_BASE_URL',
        'MINIMAX_API_KEY', 'MINIMAX_BASE_URL',
        'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
        'DEEPSEEK_API_KEY', 'GLM_API_KEY', 'KIMI_API_KEY', 'KIMI_CN_API_KEY',
        'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'XIAOMI_API_KEY', 'XIAOMI_BASE_URL'
      )
  }
  return keys
}

function inferProviderFromModel(model) {
  const m = String(model || '').trim().toLowerCase()
  if (!m) return ''
  if (m.startsWith('qwen')) return 'alibaba'
  if (m.startsWith('mimo')) return 'xiaomi'
  if (m.startsWith('minimax') || m.startsWith('abab')) return 'minimax-cn'
  return ''
}

function resolveProvider({ provider, model } = {}) {
  if (provider) return provider
  return inferProviderFromModel(model) || config.hermesProvider
}

function buildHermesEnv(provider) {
  const lines = []
  for (const k of pickEnvForProvider(provider)) {
    const v = process.env[k]
    if (v !== undefined && v !== '') {
      lines.push(`${k}=${v}`)
    }
  }
  return lines.join('\n') + '\n'
}

function yamlString(v) {
  const s = String(v ?? '')
  if (/^[A-Za-z0-9._:/\-]+$/.test(s)) return s
  return JSON.stringify(s)
}

function readTopLevelYamlSections(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n')
  const sections = []
  let current = null
  const flush = () => {
    if (!current) return
    while (current.lines.length > 0 && current.lines[current.lines.length - 1].trim() === '') {
      current.lines.pop()
    }
    if (current.lines.length > 0) sections.push(current)
    current = null
  }
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/)
    if (match) {
      flush()
      current = { key: match[1], lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()
  return sections
}

function collectPreservedConfigBlocks(contents) {
  const excluded = new Set(['model', 'display'])
  const out = []
  const seen = new Set()
  for (const content of contents) {
    for (const section of readTopLevelYamlSections(content)) {
      if (excluded.has(section.key) || seen.has(section.key)) continue
      seen.add(section.key)
      out.push(section.lines.join('\n'))
    }
  }
  return out
}

function buildHermesConfigYaml({ provider, model, preservedContents = [] }) {
  const p = provider || config.hermesProvider
  const m = model || config.hermesDefaultModel
  const base = [
    '# Auto-generated by multi-agent backend',
    'model:',
    `  provider: ${yamlString(p)}`,
    `  default: ${yamlString(m)}`,
    'display:',
    '  streaming: true',
    '  show_reasoning: true',
    '',
  ].join('\n')
  const preservedBlocks = collectPreservedConfigBlocks(preservedContents)
  if (!preservedBlocks.length) return base
  return `${base}\n${preservedBlocks.join('\n\n')}\n`
}

async function readOptionalContainerFile(containerName, absPath) {
  const cmd = [
    'bash',
    '-lc',
    `if [ -f ${JSON.stringify(absPath)} ]; then cat ${JSON.stringify(absPath)}; fi`,
  ]
  const result = await execInContainer(containerName, cmd)
  if ((result?.exitCode ?? 0) !== 0) {
    const stderrMsg = String(result?.stderr || '').trim()
    throw new Error(stderrMsg || `read optional file failed: ${absPath}`)
  }
  return String(result?.stdout || '')
}

export async function writeAgentProfile(agentId, agent) {
  const containerName = containerNameFor(agentId)
  const content = buildAgentProfileMarkdown(agent)
  await writeFileToContainer(
    containerName,
    config.hermesHomeInContainer,
    PROMPT_FILENAME,
    content
  )
}

export async function writeHermesEnvFile(agentId, { provider, model } = {}) {
  const resolvedProvider = resolveProvider({ provider, model })
  const content = buildHermesEnv(resolvedProvider)
  await writeHermesEnvRaw(agentId, content)
}

export async function writeHermesConfig(agentId, { provider, model } = {}) {
  const containerName = containerNameFor(agentId)
  const resolvedProvider = resolveProvider({ provider, model })
  const [currentConfig, legacyConfig] = await Promise.all([
    readOptionalContainerFile(containerName, `${HERMES_STATE_DIR}/${HERMES_CONFIG_FILENAME}`),
    readOptionalContainerFile(containerName, `${HERMES_LEGACY_STATE_DIR}/${HERMES_CONFIG_FILENAME}`),
  ])
  const content = buildHermesConfigYaml({
    provider: resolvedProvider,
    model,
    preservedContents: [currentConfig, legacyConfig],
  })
  await writeHermesConfigRaw(agentId, content)
}

export async function readHermesConfig(agentId) {
  const containerName = containerNameFor(agentId)
  const cmd = [
    'bash',
    '-lc',
    `if [ -f ${HERMES_STATE_DIR}/${HERMES_CONFIG_FILENAME} ]; then cat ${HERMES_STATE_DIR}/${HERMES_CONFIG_FILENAME}; elif [ -f ${HERMES_LEGACY_STATE_DIR}/${HERMES_CONFIG_FILENAME} ]; then cat ${HERMES_LEGACY_STATE_DIR}/${HERMES_CONFIG_FILENAME}; fi`,
  ]
  const result = await execInContainer(containerName, cmd)
  if ((result?.exitCode ?? 0) !== 0) {
    const stderrMsg = String(result?.stderr || '').trim()
    throw new Error(stderrMsg || `read hermes config failed with exit code ${result?.exitCode}`)
  }
  return String(result?.stdout || '')
}

export async function readHermesEnv(agentId) {
  const containerName = containerNameFor(agentId)
  const cmd = [
    'bash',
    '-lc',
    `if [ -f ${HERMES_STATE_DIR}/${HERMES_ENV_FILENAME} ]; then cat ${HERMES_STATE_DIR}/${HERMES_ENV_FILENAME}; elif [ -f ${HERMES_LEGACY_STATE_DIR}/${HERMES_ENV_FILENAME} ]; then cat ${HERMES_LEGACY_STATE_DIR}/${HERMES_ENV_FILENAME}; fi`,
  ]
  const result = await execInContainer(containerName, cmd)
  if ((result?.exitCode ?? 0) !== 0) {
    const stderrMsg = String(result?.stderr || '').trim()
    throw new Error(stderrMsg || `read hermes env failed with exit code ${result?.exitCode}`)
  }
  return String(result?.stdout || '')
}

export async function writeHermesConfigRaw(agentId, content) {
  const containerName = containerNameFor(agentId)
  const normalized = String(content ?? '').replace(/\r\n/g, '\n')
  await execInContainer(containerName, ['mkdir', '-p', HERMES_STATE_DIR])
  await execInContainer(containerName, ['mkdir', '-p', SUBPROCESS_HOME_DIR])
  await writeFileToContainer(
    containerName,
    HERMES_STATE_DIR,
    HERMES_CONFIG_FILENAME,
    normalized
  )
}

export async function writeHermesEnvRaw(agentId, content) {
  const containerName = containerNameFor(agentId)
  const normalized = String(content ?? '').replace(/\r\n/g, '\n')
  await execInContainer(containerName, ['mkdir', '-p', HERMES_STATE_DIR])
  await execInContainer(containerName, ['mkdir', '-p', SUBPROCESS_HOME_DIR])
  await writeFileToContainer(
    containerName,
    HERMES_STATE_DIR,
    HERMES_ENV_FILENAME,
    normalized
  )
}

export async function configureAgentRuntime(agentId, agent) {
  await writeHermesEnvFile(agentId, { model: agent.model })
  await writeHermesConfig(agentId, { model: agent.model })
  await writeAgentProfile(agentId, agent)
}
