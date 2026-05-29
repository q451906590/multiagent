import { Router } from 'express'
import { getAgent } from '../db.js'
import { containerNameFor, execStreaming, findContainer, safeRelPath } from '../services/hermes.js'
import { openSse } from '../utils/sse.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

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

function buildMessageWithContextFiles(content, { uploadedFiles }) {
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
  const hasUploaded = uploadedFiles.length > 0
  if (!hasUploaded) {
    return `${runtimeRules.join('\n')}\n\n用户消息：\n${content}`
  }

  const header = [...runtimeRules]
  if (hasUploaded) {
    header.push(
      `系统提示：以下是用户上传的输入素材（位于 ${uploadDir}），可作为参考输入：`,
      ...uploadedFiles.map((p) => `- ${uploadDir}/${p}`),
      ''
    )
  }

  return `${header.join('\n')}\n\n用户消息：\n${content}`
}

function isClarifyTimeoutMessage(text) {
  const s = String(text || '').toLowerCase()
  return s.includes('clarify timed out') && s.includes('agent will decide')
}

router.post('/:id/chat', async (req, res) => {
  const id = req.params.id
  const agent = getAgent(id, req.user.id)
  if (!agent) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  const content = String(req.body?.content || '').trim()
  if (!content) {
    res.status(400).json({ error: 'content is required' })
    return
  }
  const uploadedFiles = normalizeRelativeFiles(req.body?.uploadedFiles)

  const containerName = containerNameFor(id)
  const sse = openSse(res)

  const c = await findContainer(containerName)
  if (!c) {
    sse.send('error', { message: `container ${containerName} not found, run /api/system/bootstrap first` })
    sse.close()
    return
  }
  try {
    const info = await c.inspect()
    if (!info.State?.Running) {
      try { await c.start() } catch (err) {
        sse.send('error', { message: `failed to start container: ${err?.message || err}` })
        sse.close()
        return
      }
    }
  } catch (err) {
    sse.send('error', { message: `inspect container failed: ${err?.message || err}` })
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
    const composedContent = buildMessageWithContextFiles(content, { uploadedFiles })
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
        logger.warn('[chat] hermes clarify timeout; returning streamed output anyway')
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
      throw new Error(
        stderrMsg
          || 'hermes returned empty response'
      )
    }
    sse.send('done', { content: acc })
    sse.close()
  } catch (err) {
    if (timer) clearTimeout(timer)
    if (timedOut) {
      // timeout message has been sent before aborting
    } else if (controller.signal.aborted) {
      sse.send('error', { message: 'aborted' })
    } else {
      logger.error('chat exec failed:', err?.stack || err)
      sse.send('error', { message: err?.message || 'chat_failed' })
    }
    sse.close()
  }
})

export default router
