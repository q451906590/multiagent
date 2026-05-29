import crypto from 'node:crypto'
import path from 'node:path'
import { config } from '../config.js'
import { safeRelPath } from './hermes.js'

function safeId(value, fallback = 'default') {
  const compact = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
  return compact || fallback
}

export function sanitizeSessionId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  return safeId(raw, '')
}

export function normalizeChatSessionId(input) {
  const safe = sanitizeSessionId(input)
  if (safe) return safe
  return `chat_${crypto.randomUUID()}`
}

export function resolveWorkflowDeliverablesDir(runId, agentId) {
  if (!config.runScopedArtifacts) return config.deliveryDirInContainer
  return path.posix.join(
    config.deliveryDirInContainer,
    'runs',
    safeId(runId, 'run'),
    safeId(agentId, 'agent')
  )
}

export function resolveWorkflowReceivedDir(runId, sourceAgentId) {
  if (!config.runScopedArtifacts) return config.receivedDirInContainer
  return path.posix.join(
    config.receivedDirInContainer,
    'runs',
    safeId(runId, 'run'),
    safeId(sourceAgentId, 'source')
  )
}

export function resolveWorkflowReceivedRoot(runId) {
  if (!config.runScopedArtifacts) return config.receivedDirInContainer
  return path.posix.join(
    config.receivedDirInContainer,
    'runs',
    safeId(runId, 'run')
  )
}

export function resolveWorkflowReceivedRelPath(runId, sourceAgentId, relPath) {
  const normalizedRelPath = safeRelPath(relPath)
  if (!config.runScopedArtifacts) {
    return safeRelPath(path.posix.join(sourceAgentId, normalizedRelPath))
  }
  return safeRelPath(path.posix.join('runs', safeId(runId, 'run'), safeId(sourceAgentId, 'source'), normalizedRelPath))
}

export function resolveChatDeliverablesDir(chatSessionId, agentId) {
  return path.posix.join(
    config.deliveryDirInContainer,
    'chats',
    safeId(chatSessionId, 'chat'),
    safeId(agentId, 'agent')
  )
}

export function resolveChatReceivedDir(chatSessionId, source = 'shared') {
  return path.posix.join(
    config.receivedDirInContainer,
    'chats',
    safeId(chatSessionId, 'chat'),
    safeId(source, 'shared')
  )
}

export function resolveChatReceivedRoot(chatSessionId) {
  return path.posix.join(
    config.receivedDirInContainer,
    'chats',
    safeId(chatSessionId, 'chat')
  )
}

export function resolveChatReceivedRelPath(chatSessionId, source, relPath) {
  return safeRelPath(
    path.posix.join(
      'chats',
      safeId(chatSessionId, 'chat'),
      safeId(source, 'shared'),
      safeRelPath(relPath)
    )
  )
}
