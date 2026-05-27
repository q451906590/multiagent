<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import WorkflowCanvas from '../../components/workflow/WorkflowCanvas.vue'
import NodePalette from '../../components/workflow/NodePalette.vue'
import NodeInspector from '../../components/workflow/NodeInspector.vue'
import { useWorkflow } from '../../composables/useWorkflow.js'
import { useAgents } from '../../composables/useAgents.js'

const route = useRoute()
const router = useRouter()
const { agents, ensureLoaded: ensureAgentsLoaded } = useAgents()
const {
  state,
  ensureLoaded,
  selectWorkflow,
  saveCurrentWorkflow,
  publishCurrentWorkflow,
  setCurrentWorkflowActive,
  runCurrentWorkflow,
  refreshWorkflowRun,
  addNodeToDraft,
  updateNodeInDraft,
  removeNodeFromDraft,
  removeNodesFromDraft,
  removeEdgesFromDraft,
  patchNodesFromCanvas,
  patchEdgesFromCanvas,
  moveNodeInDraft,
} = useWorkflow()

const selectedNodeId = ref('')
const runInputText = ref('{}')
const pollTimer = ref(null)
const pollInFlight = ref(false)
const POLL_INTERVAL_MS = 2500

const selectedNode = computed(() =>
  state.nodes.find((item) => item.id === selectedNodeId.value) || null
)

const nodeRunStatusMap = computed(() => {
  const map = new Map()
  const events = Array.isArray(state.lastRun?.events) ? state.lastRun.events : []
  for (const event of events) {
    const nodeId = String(event?.nodeId || '').trim()
    if (!nodeId) continue
    const rawStatus = String(event?.eventStatus || event?.eventType || '').toLowerCase()
    let status = ''
    if (rawStatus.includes('fail') || rawStatus.includes('error')) status = 'failed'
    else if (rawStatus.includes('succeed') || rawStatus.includes('success') || rawStatus.includes('completed')) status = 'succeeded'
    else if (rawStatus.includes('running') || rawStatus.includes('queued') || rawStatus.includes('prepare') || rawStatus.includes('retry')) status = 'running'
    if (!status) continue
    const prev = map.get(nodeId)
    if (prev === 'failed') continue
    if (prev === 'running' && status === 'succeeded') map.set(nodeId, 'succeeded')
    else if (!prev || status === 'failed' || status === 'running') map.set(nodeId, status)
  }
  if (!map.size) {
    const runStatus = String(state.lastRun?.status || '').toLowerCase()
    let fallback = ''
    if (runStatus === 'running' || runStatus === 'queued') fallback = 'running'
    if (runStatus === 'failed') fallback = 'failed'
    if (runStatus === 'succeeded') fallback = 'succeeded'
    if (fallback) {
      for (const node of state.nodes) {
        const nodeId = String(node?.id || '').trim()
        if (nodeId) map.set(nodeId, fallback)
      }
    }
  }
  return map
})

const displayNodes = computed(() => {
  const map = nodeRunStatusMap.value
  const runArchive = state.lastRun?.output?.resultArchive && typeof state.lastRun.output.resultArchive === 'object'
    ? state.lastRun.output.resultArchive
    : null
  return state.nodes.map((node) => {
    const nodeId = String(node?.id || '').trim()
    const runStatus = String(map.get(nodeId) || '')
    const data = node?.data && typeof node.data === 'object' ? { ...node.data } : {}
    if (runStatus) data.runStatus = runStatus
    if (String(node?.type || '').trim() === 'result' && runStatus === 'succeeded' && runArchive?.downloadPath) {
      data.resultArchive = {
        archiveName: String(runArchive.archiveName || 'workflow-result.zip'),
        downloadPath: String(runArchive.downloadPath || ''),
      }
    } else {
      delete data.resultArchive
    }
    const style = node?.style && typeof node.style === 'object' ? { ...node.style } : {}
    if (runStatus === 'running') {
      style.borderColor = '#1677ff'
      style.boxShadow = '0 0 0 2px rgba(22,119,255,0.16)'
    } else if (runStatus === 'succeeded') {
      style.borderColor = '#52c41a'
      style.boxShadow = '0 0 0 2px rgba(82,196,26,0.16)'
    } else if (runStatus === 'failed') {
      style.borderColor = '#be2d33'
      style.boxShadow = '0 0 0 2px rgba(190,45,51,0.16)'
    }
    return {
      ...node,
      data,
      style,
    }
  })
})

function handleCanvasNodesUpdate(nodes) {
  patchNodesFromCanvas(nodes)
}

function handleCanvasEdgesUpdate(edges) {
  patchEdgesFromCanvas(edges)
}

function handleNodesRemoved(nodes) {
  const ids = (Array.isArray(nodes) ? nodes : [])
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean)
  console.log('handleNodesRemoved', ids)
  removeNodesFromDraft(ids)
}

function handleEdgesRemoved(edges) {
  const ids = (Array.isArray(edges) ? edges : [])
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean)
  removeEdgesFromDraft(ids)
}

function handleNodePositionChange(payload) {
  moveNodeInDraft(payload)
}

function addNode(definition) {
  const created = addNodeToDraft(definition)
  selectedNodeId.value = String(created?.id || '')
}

function onNodeSelected(node) {
  selectedNodeId.value = String(node?.id || '')
}

function updateNode(next) {
  updateNodeInDraft(next)
}

function deleteNode(nodeId) {
  const id = String(nodeId || '').trim()
  if (!id) return
  removeNodeFromDraft(id)
  if (selectedNodeId.value === id) selectedNodeId.value = ''
}

function confirmDiscardDraft() {
  if (!state.draftDirty) return true
  return window.confirm('当前工作流有未保存修改，是否放弃并继续？')
}

async function loadCurrentWorkflow() {
  await Promise.all([ensureAgentsLoaded(), ensureLoaded()])
  const workflowId = String(route.params.workflowId || '').trim()
  if (!workflowId) {
    router.replace({ name: 'workflow-list' })
    return
  }
  try {
    await selectWorkflow(workflowId)
    selectedNodeId.value = ''
  } catch (_) {
    router.replace({ name: 'workflow-list' })
  }
}

async function handleSave() {
  await saveCurrentWorkflow()
}

async function handlePublish() {
  await publishCurrentWorkflow()
}

async function handleActivate() {
  if (state.draftDirty && !window.confirm('有未保存修改。激活不会自动保存，是否继续？')) return
  await setCurrentWorkflowActive(true)
}

async function handlePause() {
  if (state.draftDirty && !window.confirm('有未保存修改。停用不会自动保存，是否继续？')) return
  await setCurrentWorkflowActive(false)
}

async function handleRun() {
  if (state.draftDirty && !window.confirm('当前有未保存草稿。运行将基于已保存版本，是否继续？')) return
  let input = {}
  try {
    input = JSON.parse(String(runInputText.value || '{}'))
  } catch (_) {
    input = {}
  }
  const run = await runCurrentWorkflow(input)
  await refreshWorkflowRun(run?.id)
  startPollingRunStatus(run?.id)
}

async function handleRefreshRun() {
  await refreshWorkflowRun()
}

function stopPollingRunStatus() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

async function pollRunStatus(runId) {
  const target = String(runId || state.lastRun?.id || '').trim()
  if (!target || pollInFlight.value) return
  pollInFlight.value = true
  try {
    await refreshWorkflowRun(target)
  } finally {
    pollInFlight.value = false
  }
}

function startPollingRunStatus(runId) {
  const target = String(runId || '').trim()
  if (!target) return
  stopPollingRunStatus()
  pollTimer.value = setInterval(() => {
    pollRunStatus(target)
  }, POLL_INTERVAL_MS)
}

watch(
  () => String(state.lastRun?.status || '').toLowerCase(),
  (status) => {
    if (!status) return
    const terminal = ['succeeded', 'failed', 'canceled'].includes(status)
    if (terminal) {
      stopPollingRunStatus()
      return
    }
    if (!pollTimer.value && state.lastRun?.id) {
      startPollingRunStatus(state.lastRun.id)
    }
  }
)

function handleBeforeUnload(event) {
  if (!state.draftDirty) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave((to, from, next) => {
  if (!confirmDiscardDraft()) {
    next(false)
    return
  }
  next()
})

onBeforeRouteUpdate(async (to, from, next) => {
  const toId = String(to?.params?.workflowId || '').trim()
  const fromId = String(from?.params?.workflowId || '').trim()
  if (toId === fromId) {
    next()
    return
  }
  if (!confirmDiscardDraft()) {
    next(false)
    return
  }
  try {
    await selectWorkflow(toId)
    selectedNodeId.value = ''
    next()
  } catch (_) {
    next({ name: 'workflow-list' })
  }
})

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadCurrentWorkflow()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  stopPollingRunStatus()
})
</script>

<template>
  <section class="workflow-detail-page">
    <div class="canvas-stage">
      <WorkflowCanvas
        :nodes="displayNodes"
        :edges="state.edges"
        @update:nodes="handleCanvasNodesUpdate"
        @update:edges="handleCanvasEdgesUpdate"
        @node-selected="onNodeSelected"
        @node-position-change="handleNodePositionChange"
        @nodes-removed="handleNodesRemoved"
        @edges-removed="handleEdgesRemoved"
      />

      <div class="floating-actions">
        <button class="btn" :disabled="state.saving" @click="handleSave">保存</button>
        <button class="btn" @click="handlePublish">发布</button>
        <button class="btn" @click="handleActivate">激活</button>
        <button class="btn" @click="handlePause">停用</button>
        <button class="btn primary" :disabled="state.running" @click="handleRun">
          {{ state.running ? '运行中…' : '运行' }}
        </button>
        <button class="btn" :disabled="!state.lastRun?.id" @click="handleRefreshRun">刷新</button>
        <span v-if="state.draftDirty" class="dirty-badge">未保存草稿</span>
      </div>

      <div class="floating-run">
        <label>运行输入 JSON</label>
        <textarea v-model="runInputText" rows="3" />
        <a
          v-if="state.lastRun?.output?.resultArchive?.downloadPath"
          class="run-download"
          :href="state.lastRun.output.resultArchive.downloadPath"
        >
          下载结果压缩包（{{ state.lastRun.output.resultArchive.archiveName || 'result.zip' }}）
        </a>
      </div>

      <div class="floating-palette">
        <NodePalette :agents="agents" @add-node="addNode" />
      </div>

      <transition name="slide-right">
        <div v-if="selectedNode" class="floating-inspector">
          <NodeInspector
            :node="selectedNode"
            :all-nodes="state.nodes"
            @update-node="updateNode"
            @delete-node="deleteNode"
          />
        </div>
      </transition>
    </div>
  </section>
</template>

<style scoped>
.workflow-detail-page {
  width: 100%;
  height: calc(100vh - 52px);
  padding: 0;
  overflow: hidden;
}

.canvas-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border-radius: 0;
  overflow: hidden;
}

.floating-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 12;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-width: min(70%, 740px);
  justify-content: flex-end;
}

.dirty-badge {
  height: 32px;
  line-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #f2c5c7;
  color: #be2d33;
  background: #fff5f5;
  font-size: 12px;
}

.floating-run {
  position: absolute;
  top: 56px;
  right: 12px;
  z-index: 12;
  width: min(420px, calc(100% - 24px));
  display: grid;
  gap: 6px;
  border: 1px solid var(--kd-line);
  border-radius: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(2px);
}

.floating-run label {
  font-size: 12px;
  color: var(--kd-text-muted);
}

.floating-run textarea {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.run-download {
  font-size: 12px;
  color: var(--kd-primary);
  width: fit-content;
}

.floating-palette {
  position: absolute;
  top: 72px;
  left: 12px;
  z-index: 11;
}

.floating-inspector {
  position: absolute;
  top: 72px;
  right: 12px;
  z-index: 13;
}

.btn {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  height: 32px;
  padding: 0 12px;
  background: #fff;
}

.btn.primary {
  border-color: var(--kd-primary);
  color: var(--kd-primary);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(16px);
  opacity: 0;
}

@media (max-width: 1200px) {
  .floating-palette { top: 340px; }

  .floating-inspector {
    top: 340px;
  }

  .floating-run {
    top: 96px;
    width: min(360px, calc(100% - 24px));
  }
}

@media (max-width: 900px) {
  .canvas-stage {
    height: 100%;
    min-height: 100%;
  }

  .floating-actions {
    max-width: calc(100% - 24px);
  }

  .floating-palette,
  .floating-inspector {
    position: static;
    margin-top: 10px;
  }
}
</style>
