<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { sendMessage } from '../api/chat.js'
import { listAgentFiles, deliverAgentFiles, uploadAgentFiles, deleteAgentFile, downloadAgentFilesZip } from '../api/files.js'
import { toAuthedUrl } from '../api/http.js'
import { useAgents } from '../composables/useAgents.js'

const props = defineProps({
  agent: { type: Object, required: true },
  windowMode: { type: String, default: 'fullscreen' },
})

const emit = defineEmits(['back', 'toggle-window', 'request-fullscreen'])

const draft = ref('')
const sending = ref(false)
const messagesEl = ref(null)
const textareaEl = ref(null)
const uploadInputEl = ref(null)
const filesOpen = ref(false)
const filesLoading = ref(false)
const filesError = ref('')
const availableFiles = ref([])
const selectedFiles = ref([])
const targetAgentId = ref('')
const fileListScope = ref('delivery')
const delivering = ref(false)
const deliveryError = ref('')
const deletingFilePath = ref('')
const deleteError = ref('')
const uploading = ref(false)
const uploadError = ref('')
const pendingUploadedFiles = ref([])
const downloadingZip = ref(false)
const downloadZipError = ref('')
let abortController = null

const messages = computed(() => props.agent.messages)
const { agents } = useAgents()
const deliverTargets = computed(() => agents.filter((a) => a.id !== props.agent.id))
const allFilesSelected = computed(
  () => availableFiles.value.length > 0 && selectedFiles.value.length === availableFiles.value.length
)
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

function isAbsoluteExternalUrl(src) {
  return /^https?:\/\//i.test(src) || /^data:/i.test(src)
}

function normalizeRelativeAssetPath(src) {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (isAbsoluteExternalUrl(raw) || raw.startsWith('/api/')) return raw
  if (raw.startsWith('/opt/data/deliverables/')) return `deliverables/${raw.slice('/opt/data/deliverables/'.length)}`
  if (raw.startsWith('/opt/data/received/')) return `received/${raw.slice('/opt/data/received/'.length)}`
  if (raw.startsWith('/opt/data/inbox/')) return `inbox/${raw.slice('/opt/data/inbox/'.length)}`
  return raw.replace(/^\.?\//, '')
}

function buildAgentRawUrl(agentId, scope, relPath) {
  return toAuthedUrl(`/api/agents/${encodeURIComponent(agentId)}/files/raw?scope=${scope}&path=${encodeURIComponent(relPath)}`)
}

function buildAgentDownloadUrl(agentId, scope, relPath) {
  return buildAgentRawUrl(agentId, scope, relPath)
}

function toAgentFileUrl(src, agentId) {
  const normalized = normalizeRelativeAssetPath(src)
  if (!normalized || isAbsoluteExternalUrl(normalized) || normalized.startsWith('/api/')) return normalized
  let scope = 'delivery'
  let relPath = normalized
  if (normalized.startsWith('deliverables/')) {
    relPath = normalized.slice('deliverables/'.length)
    scope = 'delivery'
  } else if (normalized.startsWith('received/')) {
    relPath = normalized.slice('received/'.length)
    scope = 'received'
  } else if (normalized.startsWith('inbox/')) {
    relPath = normalized.slice('inbox/'.length)
    scope = 'inbox'
  } else {
    scope = 'delivery'
  }
  return buildAgentRawUrl(agentId, scope, relPath)
}

const defaultImageRenderer = md.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src')
  if (src) token.attrSet('src', toAgentFileUrl(src, env?.agentId))
  token.attrSet('loading', 'lazy')
  return defaultImageRenderer(tokens, idx, options, env, self)
}

const defaultLinkOpenRenderer = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href')
  let finalHref = href
  if (href && !isAbsoluteExternalUrl(href) && !href.startsWith('/api/')) {
    finalHref = toAgentFileUrl(href, env?.agentId)
    token.attrSet('href', finalHref)
  }
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpenRenderer(tokens, idx, options, env, self)
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => messages.value.length,
  () => scrollToBottom()
)

async function onSend() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  const uploadedFiles = [...pendingUploadedFiles.value]
  pendingUploadedFiles.value = []

  const userMsg = { role: 'user', content, ts: Date.now() }
  messages.value.push(userMsg)
  draft.value = ''
  await scrollToBottom()

  const assistantMsg = { role: 'assistant', content: '', ts: Date.now() }
  messages.value.push(assistantMsg)
  const idx = messages.value.length - 1

  sending.value = true
  abortController = new AbortController()
  try {
    const finalContent = await sendMessage({
      agent: props.agent,
      history: messages.value.slice(0, -2),
      content,
      uploadedFiles,
      signal: abortController.signal,
      onDelta: (_ch, acc) => {
        messages.value[idx].content = acc
        scrollToBottom()
      },
    })
    if (!messages.value[idx].content && !finalContent) {
      messages.value[idx].content = '（模型未返回内容，请检查后端日志）'
    }
  } catch (err) {
    if (uploadedFiles.length > 0) {
      pendingUploadedFiles.value = [...new Set([...pendingUploadedFiles.value, ...uploadedFiles])]
    }
    if (err?.name === 'AbortError') {
      messages.value[idx].content += '\n（已停止）'
    } else {
      messages.value[idx].content = `[出错] ${err?.message || err}`
    }
  } finally {
    sending.value = false
    abortController = null
    await nextTick()
    textareaEl.value?.focus()
  }
}

async function refreshFiles() {
  filesLoading.value = true
  filesError.value = ''
  downloadZipError.value = ''
  try {
    const list = await listAgentFiles(props.agent.id, { scope: fileListScope.value })
    availableFiles.value = Array.isArray(list) ? list : []
    selectedFiles.value = selectedFiles.value.filter((p) => availableFiles.value.some((f) => f.path === p))
  } catch (err) {
    filesError.value = err?.message || String(err)
  } finally {
    filesLoading.value = false
  }
}

async function toggleFilesPanel() {
  filesOpen.value = !filesOpen.value
  if (filesOpen.value && availableFiles.value.length === 0 && !filesLoading.value) {
    await refreshFiles()
  }
}

function toggleFile(path) {
  downloadZipError.value = ''
  if (selectedFiles.value.includes(path)) {
    selectedFiles.value = selectedFiles.value.filter((x) => x !== path)
  } else {
    selectedFiles.value = [...selectedFiles.value, path]
  }
}

function toggleSelectAllFiles() {
  downloadZipError.value = ''
  if (allFilesSelected.value) {
    selectedFiles.value = []
    return
  }
  selectedFiles.value = availableFiles.value.map((f) => f.path)
}

async function deliverSelectedFiles() {
  if (!targetAgentId.value || selectedFiles.value.length === 0 || delivering.value) return
  delivering.value = true
  deliveryError.value = ''
  try {
    const result = await deliverAgentFiles(props.agent.id, {
      targetAgentId: targetAgentId.value,
      files: selectedFiles.value,
    })
    const delivered = Array.isArray(result?.delivered) ? result.delivered : []
    const failed = Array.isArray(result?.failed) ? result.failed : []
    if (failed.length > 0) {
      deliveryError.value = `部分文件交付失败：${failed.map((x) => x.path).join(', ')}`
    }
    if (delivered.length > 0) {
      selectedFiles.value = []
      window.alert(`已交付 ${delivered.length} 个文件。目标 Agent 可在 received 目录中读取这些结果。`)
    }
  } catch (err) {
    deliveryError.value = err?.message || String(err)
  } finally {
    delivering.value = false
  }
}

async function deleteListedFile(path) {
  const relPath = String(path || '').trim()
  if (!relPath || deletingFilePath.value) return
  const confirmed = window.confirm(`确认删除文件：${relPath}？`)
  if (!confirmed) return

  deletingFilePath.value = relPath
  deleteError.value = ''
  try {
    await deleteAgentFile(props.agent.id, { scope: fileListScope.value, path: relPath })
    await refreshFiles()
  } catch (err) {
    deleteError.value = err?.message || String(err)
  } finally {
    deletingFilePath.value = ''
  }
}

function triggerUploadPicker() {
  if (uploading.value) return
  uploadInputEl.value?.click()
}

async function uploadFiles(files) {
  const list = Array.isArray(files) ? files : []
  if (list.length === 0) return
  uploading.value = true
  uploadError.value = ''
  try {
    const result = await uploadAgentFiles(props.agent.id, { files: list })
    const uploaded = Array.isArray(result?.uploaded) ? result.uploaded : []
    const paths = uploaded
      .map((x) => (typeof x?.path === 'string' ? x.path.trim() : ''))
      .filter(Boolean)
    if (paths.length > 0) {
      pendingUploadedFiles.value = [...new Set([...pendingUploadedFiles.value, ...paths])]
    }
  } catch (err) {
    uploadError.value = err?.message || String(err)
  } finally {
    uploading.value = false
  }
}

async function onSelectUploadFiles(event) {
  const files = Array.from(event?.target?.files || [])
  if (event?.target) event.target.value = ''
  if (files.length === 0) return
  await uploadFiles(files)
}

async function onPaste(event) {
  const clipboardItems = Array.from(event?.clipboardData?.items || [])
  if (clipboardItems.length === 0 || uploading.value) return
  const imageFiles = clipboardItems
    .filter((item) => item?.kind === 'file' && String(item?.type || '').startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (imageFiles.length === 0) return
  event.preventDefault()
  await uploadFiles(imageFiles)
}

function removePendingUploadedFile(path) {
  pendingUploadedFiles.value = pendingUploadedFiles.value.filter((x) => x !== path)
}

function downloadFile(relPath, scope = 'delivery') {
  const url = buildAgentDownloadUrl(props.agent.id, scope, relPath)
  const link = document.createElement('a')
  link.href = url
  link.download = String(relPath || '').split('/').pop() || 'download'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function downloadSelectedFilesZip() {
  if (selectedFiles.value.length === 0 || downloadingZip.value) return
  downloadingZip.value = true
  downloadZipError.value = ''
  try {
    const { blob, filename } = await downloadAgentFilesZip(props.agent.id, {
      scope: fileListScope.value,
      files: selectedFiles.value,
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || `${props.agent.id}-files.zip`
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (err) {
    downloadZipError.value = err?.message || String(err)
  } finally {
    downloadingZip.value = false
  }
}

function renderAssistantContent(content) {
  return md.render(String(content || ''), { agentId: props.agent.id })
}

function formatFileSize(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function onStop() {
  abortController?.abort()
}

function onToggleWindow() {
  emit('toggle-window')
}

function onHeadDblclick() {
  if (props.windowMode === 'floating') {
    emit('request-fullscreen')
  }
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    onSend()
  }
}

onBeforeUnmount(() => {
  abortController?.abort()
})

watch(
  () => props.agent.id,
  () => {
    filesOpen.value = false
    filesLoading.value = false
    filesError.value = ''
    deliveryError.value = ''
    deletingFilePath.value = ''
    deleteError.value = ''
    downloadingZip.value = false
    downloadZipError.value = ''
    availableFiles.value = []
    selectedFiles.value = []
    targetAgentId.value = ''
    fileListScope.value = 'delivery'
    uploading.value = false
    uploadError.value = ''
    pendingUploadedFiles.value = []
  }
)
</script>

<template>
  <section class="chat" :class="`mode-${windowMode}`">
    <header class="chat-head" @dblclick="onHeadDblclick">
      <button class="back-btn" aria-label="返回" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M14 6l-6 6 6 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <div class="head-info">
        <div class="avatar">{{ agent.emoji || '🤖' }}</div>
        <div class="head-text">
          <div class="name">{{ agent.name }}</div>
          <div v-if="agent.role" class="role">{{ agent.role }}</div>
        </div>
      </div>
      <div class="head-actions">
        <div class="model-tag">{{ agent.model }}</div>
        <button
          class="window-btn"
          :title="windowMode === 'fullscreen' ? '缩放到小窗口' : '放大到全屏'"
          @click="onToggleWindow"
        >
          <svg v-if="windowMode === 'fullscreen'" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4h16v16H4z M8 8h8v8H8z"
              stroke="currentColor"
              stroke-width="1.6"
              fill="none"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </header>

    <div ref="messagesEl" class="messages">
      <div v-if="messages.length === 0" class="empty">
        <div class="empty-emoji">{{ agent.emoji || '🤖' }}</div>
        <div class="empty-title">开始与 {{ agent.name }} 对话</div>
        <div v-if="agent.systemPrompt" class="empty-prompt">
          {{ agent.systemPrompt }}
        </div>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="msg"
        :class="msg.role"
      >
        <div class="bubble">
          <div v-if="msg.content && msg.role === 'assistant'" class="md-body" v-html="renderAssistantContent(msg.content)"></div>
          <span v-else-if="msg.content">{{ msg.content }}</span>
          <span v-else class="dot-loader">
            <i></i><i></i><i></i>
          </span>
        </div>
      </div>
    </div>

    <section class="delivery-tools">
      <div class="upload-head">
        <input
          ref="uploadInputEl"
          type="file"
          multiple
          class="upload-input"
          @change="onSelectUploadFiles"
        />
        <button class="panel-toggle-btn" :disabled="uploading" @click="triggerUploadPicker">
          {{ uploading ? '上传中…' : '上传文件/图片' }}
        </button>
        <div v-if="pendingUploadedFiles.length > 0" class="pending-tip">
          下一条消息将附带 {{ pendingUploadedFiles.length }} 个上传文件
        </div>
      </div>
      <div v-if="uploadError" class="delivery-error">上传失败：{{ uploadError }}</div>
      <div v-if="pendingUploadedFiles.length > 0" class="uploaded-list">
        <div v-for="p in pendingUploadedFiles" :key="p" class="uploaded-item">
          <span class="file-path">{{ p }}</span>
          <button class="remove-uploaded-btn" @click="removePendingUploadedFile(p)">移除</button>
        </div>
      </div>

      <div class="delivery-head">
        <button class="panel-toggle-btn" @click="toggleFilesPanel">
          {{ filesOpen ? '收起文件交付面板' : '打开文件交付面板' }}
        </button>
      </div>

      <div v-if="filesOpen" class="delivery-panel">
        <div class="panel-actions">
          <select v-model="fileListScope" @change="refreshFiles">
            <option value="delivery">查看我生成的文件</option>
            <option value="received">查看被交付给我的文件</option>
          </select>
          <select v-model="targetAgentId">
            <option value="">选择目标 Agent</option>
            <option v-for="a in deliverTargets" :key="a.id" :value="a.id">
              {{ a.emoji || '🤖' }} {{ a.name }}
            </option>
          </select>
          <button class="panel-toggle-btn" :disabled="filesLoading" @click="refreshFiles">
            {{ filesLoading ? '加载中…' : '刷新文件列表' }}
          </button>
          <button
            class="panel-toggle-btn"
            :disabled="availableFiles.length === 0"
            @click="toggleSelectAllFiles"
          >
            {{ allFilesSelected ? '取消全选' : `全选（${availableFiles.length}）` }}
          </button>
          <button
            class="panel-toggle-btn"
            :disabled="selectedFiles.length === 0 || downloadingZip"
            @click="downloadSelectedFilesZip"
          >
            {{ downloadingZip ? '打包中…' : `下载选中压缩包（${selectedFiles.length}）` }}
          </button>
          <button
            class="send-btn"
            :disabled="fileListScope !== 'delivery' || !targetAgentId || selectedFiles.length === 0 || delivering"
            @click="deliverSelectedFiles"
          >
            {{ fileListScope === 'delivery' ? (delivering ? '交付中…' : `交付选中文件（${selectedFiles.length}）`) : '仅支持交付“我生成的文件”' }}
          </button>
        </div>

        <div v-if="filesError" class="delivery-error">文件列表加载失败：{{ filesError }}</div>
        <div v-if="deliveryError" class="delivery-error">{{ deliveryError }}</div>
        <div v-if="deleteError" class="delivery-error">删除失败：{{ deleteError }}</div>
        <div v-if="downloadZipError" class="delivery-error">打包下载失败：{{ downloadZipError }}</div>

        <div class="files-list">
          <label v-for="f in availableFiles" :key="f.path" class="file-item">
            <input
              type="checkbox"
              :checked="selectedFiles.includes(f.path)"
              @change="toggleFile(f.path)"
            />
            <span class="file-path">{{ f.path }}</span>
            <span class="file-size">{{ formatFileSize(f.size) }}</span>
            <button
              class="preview-btn"
              @click.stop.prevent="downloadFile(f.path, fileListScope)"
            >
              下载
            </button>
            <button
              class="remove-file-btn"
              :disabled="deletingFilePath === f.path"
              @click.stop.prevent="deleteListedFile(f.path)"
            >
              {{ deletingFilePath === f.path ? '删除中…' : '删除' }}
            </button>
          </label>
          <div v-if="!filesLoading && availableFiles.length === 0" class="empty-files">
            {{ fileListScope === 'delivery' ? '当前没有可交付文件' : '当前没有被交付文件' }}
          </div>
        </div>
      </div>
    </section>

    <footer class="composer">
      <textarea
        ref="textareaEl"
        v-model="draft"
        rows="1"
        placeholder="向 agent 发送消息（Enter 发送，Shift+Enter 换行）"
        @keydown="onKeydown"
        @paste="onPaste"
      ></textarea>
      <button
        v-if="!sending"
        class="send-btn"
        :disabled="!draft.trim()"
        @click="onSend"
      >
        发送
      </button>
      <button v-else class="send-btn stop" @click="onStop">停止</button>
    </footer>
  </section>
</template>

<style scoped>
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.chat.mode-floating .chat-head {
  cursor: move;
  user-select: none;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--color-surface-soft);
  border-color: var(--color-border-strong);
}

.head-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-primary-soft);
  font-size: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.head-text {
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.model-tag {
  font-size: 11px;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--color-text-soft);
}

.window-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.window-btn:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
  background: var(--color-surface-soft);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}

.empty {
  margin: auto;
  text-align: center;
  color: var(--color-text-muted);
  max-width: 520px;
  padding: 32px 16px;
}

.empty-emoji {
  font-size: 48px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-top: 12px;
}

.empty-prompt {
  margin-top: 12px;
  font-size: 13px;
  white-space: pre-wrap;
  line-height: 1.6;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  text-align: left;
  color: var(--color-text-soft);
}

.msg {
  display: flex;
  width: 100%;
}

.msg.user {
  justify-content: flex-end;
}

.msg.assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: min(720px, 78%);
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: var(--shadow-sm);
}

.md-body {
  line-height: 1.6;
}

.md-body :deep(p) {
  margin: 0 0 0.7em;
}

.md-body :deep(p:last-child) {
  margin-bottom: 0;
}

.md-body :deep(pre) {
  margin: 0.6em 0;
  background: rgba(0, 0, 0, 0.35);
  color: #f7f7f7;
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
}

.md-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.md-body :deep(:not(pre) > code) {
  background: rgba(127, 127, 127, 0.2);
  border-radius: 6px;
  padding: 0.1em 0.4em;
}

.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6em 0;
}

.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
}

.md-body :deep(img) {
  max-width: min(100%, 640px);
  border-radius: 10px;
  margin: 0.6em 0;
  border: 1px solid var(--color-border);
  display: block;
}

.md-body :deep(blockquote) {
  margin: 0.6em 0;
  border-left: 3px solid var(--color-border-strong);
  padding-left: 10px;
  color: var(--color-text-soft);
}

.msg.user .bubble {
  background: var(--color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg.assistant .bubble {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 4px;
}

.dot-loader {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.dot-loader i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: bounce 1.2s infinite ease-in-out;
}

.dot-loader i:nth-child(2) {
  animation-delay: 0.15s;
}

.dot-loader i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.composer {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  padding: 14px 24px 22px;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

.delivery-tools {
  padding: 8px 24px 0;
}

.delivery-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.upload-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.upload-input {
  display: none;
}

.panel-toggle-btn {
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  padding: 6px 10px;
  font-size: 12px;
}

.pending-tip {
  font-size: 12px;
  color: var(--color-text-muted);
}

.delivery-panel {
  margin-top: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panel-actions select {
  min-width: 220px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--color-bg);
  color: var(--color-text);
}

.files-list {
  max-height: 180px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.file-item:last-child {
  border-bottom: none;
}

.file-path {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.file-size {
  font-size: 12px;
  color: var(--color-text-muted);
}

.preview-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  padding: 4px 8px;
  font-size: 12px;
}

.preview-btn:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.remove-file-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-danger);
  padding: 4px 8px;
  font-size: 12px;
}

.remove-file-btn:hover:not(:disabled) {
  border-color: var(--color-danger);
}

.empty-files {
  padding: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.delivery-error {
  color: var(--color-danger);
  font-size: 12px;
}

.uploaded-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.uploaded-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 6px 8px;
}

.remove-uploaded-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.composer textarea {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  resize: none;
  max-height: 200px;
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  field-sizing: content;
}

.composer textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(91, 108, 255, 0.16);
}

.send-btn {
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  font-weight: 500;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn.stop {
  background: var(--color-danger);
}

.send-btn.stop:hover {
  background: #c83a3e;
}

@media (max-width: 600px) {
  .chat-head {
    padding: 12px 14px;
  }

  .messages {
    padding: 16px 14px 8px;
  }

  .composer {
    padding: 12px 14px 16px;
  }

  .bubble {
    max-width: 88%;
  }
}
</style>
