import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  containerNameFor,
  execInContainer,
  findContainer,
  writeFileToContainer,
} from './hermes.js'

const EXT_ROOT_DIR = `${config.hermesHomeInContainer}/multiagent`
const MCP_FILE = 'mcp.json'
const SKILLS_FILE = 'skills.json'

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function nowTs() {
  return Date.now()
}

export function newId() {
  return randomUUID()
}

async function ensureContainerRunning(containerName) {
  const container = await findContainer(containerName)
  if (!container) {
    throw new Error(`container ${containerName} not found`)
  }
  const info = await container.inspect()
  if (!info.State?.Running) {
    await container.start()
  }
  return container
}

export async function ensureAgentRuntime(agentId) {
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)
  await execInContainer(containerName, ['mkdir', '-p', EXT_ROOT_DIR])
  return { containerName, rootDir: EXT_ROOT_DIR }
}

async function readJsonFile(containerName, filename) {
  const pathInContainer = `${EXT_ROOT_DIR}/${filename}`
  const cmd = `if [ -f ${shellEscape(pathInContainer)} ]; then cat ${shellEscape(pathInContainer)}; fi`
  const result = await execInContainer(containerName, ['bash', '-lc', cmd])
  const text = String(result?.stdout || '').trim()
  if (!text) return []
  let parsed = []
  try {
    parsed = JSON.parse(text)
  } catch (_) {
    return []
  }
  return Array.isArray(parsed) ? parsed : []
}

async function writeJsonFile(containerName, filename, payload) {
  const content = `${JSON.stringify(payload, null, 2)}\n`
  await writeFileToContainer(containerName, EXT_ROOT_DIR, filename, content)
}

export async function readMcpList(agentId) {
  const { containerName } = await ensureAgentRuntime(agentId)
  return readJsonFile(containerName, MCP_FILE)
}

export async function writeMcpList(agentId, items) {
  const { containerName } = await ensureAgentRuntime(agentId)
  await writeJsonFile(containerName, MCP_FILE, items)
}

export async function readSkillsList(agentId) {
  const { containerName } = await ensureAgentRuntime(agentId)
  return readJsonFile(containerName, SKILLS_FILE)
}

export async function writeSkillsList(agentId, items) {
  const { containerName } = await ensureAgentRuntime(agentId)
  await writeJsonFile(containerName, SKILLS_FILE, items)
}

export function getSkillsInstallRoot() {
  return `${EXT_ROOT_DIR}/skills`
}

export function getMcpInstallRoot() {
  return `${EXT_ROOT_DIR}/mcp`
}
