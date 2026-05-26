<script setup>
import { computed, onMounted, ref } from 'vue'
import WorkflowCanvas from '../components/workflow/WorkflowCanvas.vue'
import NodePalette from '../components/workflow/NodePalette.vue'
import NodeInspector from '../components/workflow/NodeInspector.vue'
import { useWorkflow } from '../composables/useWorkflow.js'
import { useAgents } from '../composables/useAgents.js'

const { agents, ensureLoaded: ensureAgentsLoaded } = useAgents()
const {
  state,
  ensureLoaded,
  selectWorkflow,
  createNewWorkflow,
  saveCurrentWorkflow,
  publishCurrentWorkflow,
  setCurrentWorkflowActive,
  runCurrentWorkflow,
  removeWorkflow,
  getCurrentWorkflow,
} = useWorkflow()

const selectedNodeId = ref('')
const runInputText = ref('{}')

const currentWorkflow = computed(() => getCurrentWorkflow())
const selectedNode = computed(() =>
  state.nodes.find((item) => item.id === selectedNodeId.value) || null
)

async function init() {
  await Promise.all([ensureAgentsLoaded(), ensureLoaded()])
  if (!state.list.length) {
    await createNewWorkflow({ name: '默认工作流', canvasDefinition: { nodes: [], edges: [] } })
  }
}

function addNode(definition) {
  const nextId = `${definition.type}_${Date.now()}`
  state.nodes.push({
    id: nextId,
    type: definition.type,
    label: definition.label,
    position: { x: 120 + state.nodes.length * 40, y: 120 + state.nodes.length * 24 },
    data: {
      ...(definition.data || {}),
      label: definition.label,
    },
  })
  selectedNodeId.value = nextId
}

function onNodeSelected(node) {
  selectedNodeId.value = String(node?.id || '')
}

function updateNode(next) {
  const idx = state.nodes.findIndex((item) => item.id === next.id)
  if (idx < 0) return
  state.nodes.splice(idx, 1, next)
}

function deleteNode(nodeId) {
  const id = String(nodeId || '')
  if (!id) return
  state.nodes.splice(0, state.nodes.length, ...state.nodes.filter((item) => item.id !== id))
  state.edges.splice(0, state.edges.length, ...state.edges.filter((edge) => edge.source !== id && edge.target !== id))
  if (selectedNodeId.value === id) selectedNodeId.value = ''
}

async function handleCreateWorkflow() {
  await createNewWorkflow({ name: `工作流-${state.list.length + 1}` })
}

async function handleSave() {
  await saveCurrentWorkflow()
}

async function handlePublish() {
  await publishCurrentWorkflow()
}

async function handleActivate() {
  await setCurrentWorkflowActive(true)
}

async function handlePause() {
  await setCurrentWorkflowActive(false)
}

async function handleRun() {
  let input = {}
  try {
    input = JSON.parse(String(runInputText.value || '{}'))
  } catch (_) {
    input = {}
  }
  await runCurrentWorkflow(input)
}

async function handleDeleteWorkflow() {
  if (!currentWorkflow.value?.id) return
  await removeWorkflow(currentWorkflow.value.id)
}

async function onWorkflowChange(event) {
  const id = String(event?.target?.value || '')
  if (!id) return
  await selectWorkflow(id)
  selectedNodeId.value = ''
}

onMounted(() => {
  init()
})
</script>

<template>
  <section class="workflow-page">
    <header class="toolbar">
      <div class="left">
        <button class="btn" @click="handleCreateWorkflow">新建</button>
        <select :value="state.selectedWorkflowId" @change="onWorkflowChange">
          <option
            v-for="item in state.list"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option>
        </select>
      </div>
      <div class="right">
        <button class="btn" :disabled="state.saving" @click="handleSave">保存</button>
        <button class="btn" @click="handlePublish">发布</button>
        <button class="btn" @click="handleActivate">激活</button>
        <button class="btn" @click="handlePause">停用</button>
        <button class="btn danger" @click="handleDeleteWorkflow">删除</button>
      </div>
    </header>

    <div class="run-panel">
      <textarea
        v-model="runInputText"
        rows="3"
        placeholder='运行输入 JSON，例如 {"topic":"Q2 report"}'
      />
      <button class="btn primary" :disabled="state.running" @click="handleRun">
        {{ state.running ? '运行中…' : '运行工作流' }}
      </button>
      <div v-if="state.lastRun" class="run-tip">
        最近一次运行：{{ state.lastRun.id }}（{{ state.lastRun.status }}）
      </div>
      <div v-if="state.error" class="error">{{ state.error }}</div>
    </div>

    <div class="layout">
      <NodePalette :agents="agents" @add-node="addNode" />
      <WorkflowCanvas
        :nodes="state.nodes"
        :edges="state.edges"
        @update:nodes="(nodes) => state.nodes.splice(0, state.nodes.length, ...nodes)"
        @update:edges="(edges) => state.edges.splice(0, state.edges.length, ...edges)"
        @node-selected="onNodeSelected"
      />
      <NodeInspector
        :node="selectedNode"
        @update-node="updateNode"
        @delete-node="deleteNode"
      />
    </div>
  </section>
</template>

<style scoped>
.workflow-page {
  min-width: 0;
  padding: 16px 20px 24px;
  display: grid;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}

select,
textarea {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
}

select {
  min-width: 220px;
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

.btn.danger {
  border-color: #f2c5c7;
  color: #be2d33;
}

.run-panel {
  display: grid;
  gap: 8px;
}

.run-tip {
  font-size: 12px;
  color: var(--kd-text-muted);
}

.error {
  color: #be2d33;
  font-size: 12px;
}

.layout {
  display: flex;
  align-items: stretch;
  gap: 12px;
}
</style>
