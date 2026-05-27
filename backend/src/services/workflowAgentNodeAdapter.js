import { config } from '../config.js'
import { getAgent } from '../db.js'
import {
  containerNameFor,
  copyFilesBetweenAgents,
  execStreaming,
  findContainer,
  safeRelPath,
} from './hermes.js'

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function buildHermesInvocation(content) {
  const escaped = shellEscape(content)
  const hermesBin = '/opt/hermes/.venv/bin/hermes'
  const workdir = config.hermesHomeInContainer
  return [
    'bash',
    '-lc',
    `cd ${shellEscape(workdir)} && (${hermesBin} chat --quiet --yolo -q ${escaped} 2>/dev/null \
      || ${hermesBin} chat --yolo -q ${escaped} 2>/dev/null \
      || hermes chat --quiet --yolo -q ${escaped} 2>/dev/null \
      || hermes chat --yolo -q ${escaped} 2>/dev/null \
      || printf %s ${escaped} | ${hermesBin} ask --no-color 2>/dev/null \
      || printf %s ${escaped} | ${hermesBin} --no-color 2>/dev/null \
      || printf %s ${escaped} | hermes ask --no-color 2>/dev/null \
      || printf %s ${escaped} | hermes --no-color 2>/dev/null \
      || printf %s ${escaped} | ${hermesBin} \
      || printf %s ${escaped} | hermes)`,
  ]
}

function normalizeRelativeFiles(input) {
  if (!Array.isArray(input)) return []
  return [...new Set(
    input
      .map((item) => {
        try {
          return safeRelPath(item)
        } catch (_) {
          return null
        }
      })
      .filter(Boolean)
  )]
}

function buildMessageWithContextFiles(content, { uploadedFiles, receivedFiles, deliverableSpecs, retryHint }) {
  const deliveryDir = config.deliveryDirInContainer
  const receivedDir = config.receivedDirInContainer
  const uploadDir = config.uploadInboxDirInContainer
  const runtimeRules = [
    `System: workspace directory is ${config.hermesHomeInContainer}.`,
    `System: upload directory is ${uploadDir}.`,
    `System: output directory is ${deliveryDir}.`,
    `System: received files directory is ${receivedDir}.`,
  ]
  const received = Array.isArray(receivedFiles) ? receivedFiles.filter(Boolean) : []
  const deliverables = Array.isArray(deliverableSpecs) ? deliverableSpecs.filter(Boolean) : []

  if (received.length) {
    runtimeRules.push(
      'System: required input files copied to received directory:',
      ...received.map((file) => `- ${file}`),
    )
  }
  if (deliverables.length) {
    runtimeRules.push(
      'System: required deliverables (strict filenames under output directory):',
      ...deliverables.map((file) => `- ${file}`),
    )
  }
  if (retryHint) {
    runtimeRules.push(`System: retry hint: ${String(retryHint).trim()}`)
  }
  if (!uploadedFiles.length) {
    return `${runtimeRules.join('\n')}\n\nUser message:\n${content}`
  }
  return `${runtimeRules.join('\n')}\nSystem: uploaded files:\n${uploadedFiles
    .map((file) => `- ${uploadDir}/${file}`)
    .join('\n')}\n\nUser message:\n${content}`
}

async function ensureContainerRunning(containerName) {
  const c = await findContainer(containerName)
  if (!c) throw new Error(`container ${containerName} not found`)
  const info = await c.inspect()
  if (!info.State?.Running) {
    await c.start()
  }
}

export async function executeAgentNode({
  userId,
  agentId,
  prompt,
  uploadedFiles,
  receivedFiles,
  deliverableSpecs,
  retryHint,
  timeoutMs = config.chatTimeoutMs,
}) {
  const agent = getAgent(agentId, userId)
  if (!agent) {
    throw new Error('agent not found')
  }
  const content = String(prompt || '').trim()
  if (!content) {
    throw new Error('prompt is required')
  }
  const normalizedFiles = normalizeRelativeFiles(uploadedFiles)
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)
  const cmd = buildHermesInvocation(
    buildMessageWithContextFiles(content, {
      uploadedFiles: normalizedFiles,
      receivedFiles,
      deliverableSpecs,
      retryHint,
    })
  )

  let stdout = ''
  let stderr = ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || config.chatTimeoutMs)))
  try {
    const result = await execStreaming(containerName, cmd, {
      signal: controller.signal,
      onStdout: (chunk) => { stdout += chunk || '' },
      onStderr: (chunk) => { stderr += chunk || '' },
    })
    if ((result?.exitCode ?? 0) !== 0) {
      throw new Error(stderr.trim() || `agent node failed with exit code ${result?.exitCode}`)
    }
    if (!stdout.trim()) {
      throw new Error(stderr.trim() || 'agent node returned empty output')
    }
    return {
      output: stdout,
      stderr: stderr.trim(),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function deliverAgentNodeFiles({
  fromAgentId,
  toAgentId,
  files,
}) {
  const normalized = normalizeRelativeFiles(files)
  if (!normalized.length) {
    return { delivered: [], failed: [] }
  }
  return copyFilesBetweenAgents({
    fromAgentId,
    toAgentId,
    paths: normalized,
  })
}
