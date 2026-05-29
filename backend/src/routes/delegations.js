import { Router } from 'express'
import { getAgent } from '../db.js'
import { authDelegationKey } from '../middlewares/authDelegationKey.js'
import { authUser } from '../middlewares/authUser.js'
import { containerNameFor, execStreaming, findContainer, safeRelPath } from '../services/hermes.js'
import { openSse } from '../utils/sse.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import {
  createAgentDelegationKey,
  listAgentDelegationKeys,
  markDelegationKeyUsed,
  removeAgentDelegationKey,
  revokeAgentDelegationKey,
} from '../services/delegationService.js'

const router = Router()
function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function buildHermesInvocation(content) {
  const escaped = shellEscape(content)
  const hermesBin = '/opt/hermes/.venv/bin/hermes'
  const workdir = config.hermesHomeInContainer
  const subprocessHomeDir = config.hermesSubprocessHomeInContainer
  return [
    'bash',
    '-lc',
    `mkdir -p ${shellEscape(subprocessHomeDir)} && cd ${shellEscape(workdir)} && export HOME=${shellEscape(subprocessHomeDir)} HERMES_HOME=${shellEscape(workdir)} && (${hermesBin} chat --continue --quiet --yolo -q ${escaped} 2>/dev/null \
      || ${hermesBin} chat --continue --yolo -q ${escaped} 2>/dev/null \
      || hermes chat --continue --quiet --yolo -q ${escaped} 2>/dev/null \
      || hermes chat --continue --yolo -q ${escaped} 2>/dev/null \
      || ${hermesBin} chat --quiet --yolo -q ${escaped} 2>/dev/null \
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
      .map((x) => {
        try {
          return safeRelPath(x)
        } catch (_) {
          return null
        }
      })
      .filter(Boolean)
  )]
}

function normalizeHistoryMessages(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const role = String(item.role || '').trim().toLowerCase()
    if (role !== 'user' && role !== 'assistant') continue
    const content = String(item.content || '').trim()
    if (!content) continue
    out.push({ role, content })
  }
  return out.slice(-20)
}

function buildHistoryTranscript(history) {
  if (!Array.isArray(history) || history.length === 0) return ''
  const lines = ['系统提示：以下是同一会话的历史对话（按时间顺序）：']
  for (const msg of history) {
    const tag = msg.role === 'assistant' ? '助手' : '用户'
    lines.push(`${tag}：${msg.content}`)
  }
  return `${lines.join('\n')}\n`
}

function buildMessageWithContextFiles(content, { uploadedFiles, history }) {
  const deliveryDir = config.deliveryDirInContainer
  const receivedDir = config.receivedDirInContainer
  const uploadDir = config.uploadInboxDirInContainer
  const runtimeRules = [
    `系统提示：用户本轮原始问题：${content}`,
    `系统提示：你的工作目录是 ${config.hermesHomeInContainer}。`,
    `系统提示：Hermes 状态根目录是 ${config.hermesHomeInContainer}（sessions/memories/config 等都在此目录）。`,
    '系统提示：优先使用当前会话上下文与系统注入的历史对话回答，不要因为 session_search 返回空就声称“没有历史”。',
    `系统提示：工具子进程 HOME 目录是 ${config.hermesSubprocessHomeInContainer}（git/ssh/gh/npm 与技能 CLI 凭据读取此目录）。`,
    `系统提示：上传素材目录是 ${uploadDir}，该目录用于读取外部输入文件（图片/文档等）。`,
    `系统提示：你的产出目录是 ${deliveryDir}，请将你生成的产出文件写入该目录。`,
    `系统提示：其他 agent 交付给你的文件目录是 ${receivedDir}，请从该目录读取参考输入，不要把它与产出目录混用。`,
  ]
  const historyTranscript = buildHistoryTranscript(history)
  if (!uploadedFiles.length) {
    return `${runtimeRules.join('\n')}\n\n${historyTranscript}用户消息：\n${content}`
  }
  const header = [
    ...runtimeRules,
    `系统提示：以下是用户上传的输入素材（位于 ${uploadDir}），可作为参考输入：`,
    ...uploadedFiles.map((p) => `- ${uploadDir}/${p}`),
    '',
  ]
  return `${header.join('\n')}\n\n${historyTranscript}用户消息：\n${content}`
}

function isClarifyTimeoutMessage(text) {
  const s = String(text || '').toLowerCase()
  return s.includes('clarify timed out') && s.includes('agent will decide')
}

router.get('/agents/:id/delegations/keys', authUser, (req, res) => {
  const agentId = req.params.id
  const agent = getAgent(agentId, req.user.id)
  if (!agent) return res.status(404).json({ error: 'not_found' })
  res.json(listAgentDelegationKeys(agentId))
})

router.post('/agents/:id/delegations/keys', authUser, async (req, res) => {
  const agentId = req.params.id
  const agent = getAgent(agentId, req.user.id)
  if (!agent) return res.status(404).json({ error: 'not_found' })
  const note = String(req.body?.note || '').trim()
  let expiresAt = null
  if (req.body?.expiresAt !== undefined) {
    const n = Number(req.body.expiresAt)
    if (!Number.isFinite(n) || n <= Date.now()) {
      return res.status(400).json({ error: 'expiresAt must be a future timestamp' })
    }
    expiresAt = n
  }
  if (req.body?.ttlMs !== undefined) {
    const n = Number(req.body.ttlMs)
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'ttlMs must be a positive number' })
    }
    expiresAt = Date.now() + n
  }
  const created = createAgentDelegationKey(agentId, { note, expiresAt })
  res.status(201).json(created)
})

router.post('/agents/:id/delegations/keys/:keyId/revoke', authUser, (req, res) => {
  const agentId = req.params.id
  const agent = getAgent(agentId, req.user.id)
  if (!agent) return res.status(404).json({ error: 'not_found' })
  const ok = revokeAgentDelegationKey(agentId, req.params.keyId)
  if (!ok) return res.status(404).json({ error: 'key_not_found' })
  res.json({ ok: true })
})

router.delete('/agents/:id/delegations/keys/:keyId', authUser, (req, res) => {
  const agentId = req.params.id
  const agent = getAgent(agentId, req.user.id)
  if (!agent) return res.status(404).json({ error: 'not_found' })
  const ok = removeAgentDelegationKey(agentId, req.params.keyId)
  if (!ok) return res.status(404).json({ error: 'key_not_found' })
  res.json({ ok: true })
})

router.post('/delegations/chat', authDelegationKey, async (req, res) => {
  const callerId = String(req.headers?.['x-caller-id'] || '').trim()
  if (!callerId) return res.status(400).json({ error: 'X-Caller-Id header is required' })

  const keyAgentId = req.delegationKey?.agentId
  const agentId = String(req.body?.agentId || keyAgentId || '').trim()
  if (!agentId) return res.status(400).json({ error: 'agentId is required' })
  if (agentId !== keyAgentId) return res.status(403).json({ error: 'agentId does not match delegation key' })
  markDelegationKeyUsed(req.delegationKey.id, callerId)

  const agentOwnerId = String(req.delegationKey?.ownerUserId || '').trim()
  const agent = getAgent(agentId, agentOwnerId)
  if (!agent) return res.status(404).json({ error: 'not_found' })
  const content = String(req.body?.content || '').trim()
  if (!content) return res.status(400).json({ error: 'content is required' })
  const uploadedFiles = normalizeRelativeFiles(req.body?.uploadedFiles)
  const history = normalizeHistoryMessages(req.body?.history)

  const containerName = containerNameFor(agentId)
  const sse = openSse(res)
  const c = await findContainer(containerName)
  if (!c) {
    sse.send('error', { message: `container ${containerName} not found, run /api/system/bootstrap first` })
    sse.close()
    return
  }
  try {
    const info = await c.inspect()
    if (!info.State?.Running) await c.start()
  } catch (err) {
    sse.send('error', { message: `inspect/start container failed: ${err?.message || err}` })
    sse.close()
    return
  }

  let acc = ''
  let stderrAcc = ''
  const controller = new AbortController()
  let timer = null
  let timedOut = false
  const resetIdleTimer = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      sse.send('error', { message: `chat idle timeout after ${config.chatTimeoutMs} ms without stream output` })
      controller.abort()
    }, config.chatTimeoutMs)
  }
  resetIdleTimer()
  res.on('close', () => {
    controller.abort()
    if (timer) clearTimeout(timer)
  })

  try {
    const composedContent = buildMessageWithContextFiles(content, { uploadedFiles, history })
    const cmd = buildHermesInvocation(composedContent)
    const result = await execStreaming(containerName, cmd, {
      signal: controller.signal,
      onStdout: (chunk) => {
        if (!chunk) return
        resetIdleTimer()
        acc += chunk
        sse.send('delta', { chunk, acc })
      },
      onStderr: (chunk) => {
        if (!chunk) return
        resetIdleTimer()
        stderrAcc += chunk
        logger.debug('[hermes stderr]', chunk.trimEnd())
      },
    })
    if (timer) clearTimeout(timer)
    const stderrMsg = stderrAcc.trim()
    const hasClarifyTimeout = isClarifyTimeoutMessage(stderrMsg)
    if ((result?.exitCode ?? 0) !== 0) {
      if (hasClarifyTimeout && acc.trim()) {
        logger.warn('[delegations/chat] hermes clarify timeout; returning streamed output anyway')
      } else {
        throw new Error(
          stderrMsg
            ? `hermes exited with code ${result.exitCode}: ${stderrMsg}`
            : `hermes exited with code ${result.exitCode}`
        )
      }
    }
    if (!acc.trim()) {
      if (hasClarifyTimeout) {
        throw new Error('clarify timed out after 120s — agent will decide（当前轮未产出内容，请重试或补充更明确指令）')
      }
      throw new Error(stderrMsg || 'hermes returned empty response')
    }
    sse.send('done', { content: acc })
    sse.close()
  } catch (err) {
    if (timer) clearTimeout(timer)
    if (!timedOut) {
      if (controller.signal.aborted) {
        sse.send('error', { message: 'aborted' })
      } else {
        logger.error('delegations chat exec failed:', err?.stack || err)
        sse.send('error', { message: err?.message || 'chat_failed' })
      }
    }
    sse.close()
  }
})

export default router
