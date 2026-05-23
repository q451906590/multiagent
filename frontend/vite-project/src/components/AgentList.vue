<script setup>
import { ref, computed } from 'vue'
import AgentCard from './AgentCard.vue'
import AgentDialog from './AgentDialog.vue'
import PublishListingDialog from './PublishListingDialog.vue'
import { useAgents } from '../composables/useAgents.js'
import { useMarketplace } from '../composables/useMarketplace.js'

defineProps({
  agents: { type: Array, required: true },
})

const emit = defineEmits(['open', 'open-floating', 'manage-extensions', 'manage-delegations', 'open-marketplace'])

const { addAgent, editAgent, removeAgent, getAgent, state } = useAgents()
const { publishAgent } = useMarketplace()

const dialogMode = ref(null)
const editingId = ref(null)
const publishingAgent = ref(null)

const dialogInitial = computed(() => {
  if (dialogMode.value !== 'edit' || !editingId.value) return null
  return getAgent(editingId.value)
})

const combinedError = computed(() => state.error)

function openAddDialog() {
  editingId.value = null
  dialogMode.value = 'create'
}

function openEditDialog(id) {
  editingId.value = id
  dialogMode.value = 'edit'
}

function closeDialog() {
  dialogMode.value = null
  editingId.value = null
}

async function handleSubmit(payload) {
  try {
    if (dialogMode.value === 'edit' && editingId.value) {
      await editAgent(editingId.value, payload)
    } else {
      await addAgent(payload)
    }
    closeDialog()
  } catch (err) {
    window.alert(`操作失败：${err?.message || err}`)
  }
}

async function handleDelete(agent) {
  if (!agent?.id) return
  const prompt = '确定要删除该 agent 吗？关联的 docker 容器和长期记忆都会被清除。'
  if (!window.confirm(prompt)) return
  try {
    await removeAgent(agent.id)
  } catch (err) {
    window.alert(`删除失败：${err?.message || err}`)
  }
}

function handleOpen(agent) {
  emit('open', agent)
}

function handleOpenFloating(agent) {
  emit('open-floating', agent)
}

function handleManage(id) {
  emit('manage-extensions', id)
}

function handleDelegations(id) {
  emit('manage-delegations', id)
}

function handleOpenMarketplace() {
  emit('open-marketplace')
}

function handlePublish(agent) {
  publishingAgent.value = agent || null
}

function closePublishDialog() {
  publishingAgent.value = null
}

async function submitPublish(payload) {
  try {
    await publishAgent(payload)
    closePublishDialog()
    window.alert('发布成功，已同步到 Agent 市集。')
  } catch (err) {
    window.alert(`发布失败：${err?.message || err}`)
  }
}
</script>

<template>
  <section class="agent-list">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">M</div>
        <div class="brand-text">
          <div class="brand-title">Multi-Agent Workspace</div>
          <div class="brand-sub">为不同角色定义 system prompt，双击进入对话</div>
        </div>
      </div>
      <div class="top-actions">
        <button class="market-btn" @click="handleOpenMarketplace">Agent 市集</button>
        <div v-if="state.bootstrapping" class="status-pill">正在拉起 hermes 容器…</div>
        <div v-else-if="state.loading" class="status-pill">加载中…</div>
        <div v-else-if="combinedError" class="status-pill error">后端连接失败：{{ combinedError }}</div>
      </div>
    </header>

    <div class="grid">
      <AgentCard
        v-for="agent in agents"
        :key="agent.directoryId || agent.id"
        mode="agent"
        :agent="agent"
        @open="handleOpen"
        @open-floating="handleOpenFloating"
        @manage="handleManage"
        @delegations="handleDelegations"
        @publish="handlePublish"
        @edit="openEditDialog"
        @delete="handleDelete"
      />
      <AgentCard mode="add" @add="openAddDialog" />
    </div>

    <AgentDialog
      v-if="dialogMode"
      :mode="dialogMode"
      :initial-value="dialogInitial"
      @cancel="closeDialog"
      @submit="handleSubmit"
    />
    <PublishListingDialog
      :open="Boolean(publishingAgent)"
      :agent="publishingAgent"
      @cancel="closePublishDialog"
      @submit="submitPublish"
    />
  </section>
</template>

<style scoped>
.agent-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 32px 40px 64px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  gap: 16px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.market-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 6px 12px;
  font-size: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.5px;
}

.brand-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.brand-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.status-pill {
  font-size: 12px;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  color: var(--color-text-soft);
  border-radius: 999px;
  padding: 4px 12px;
  white-space: nowrap;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-pill.error {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

@media (max-width: 600px) {
  .agent-list {
    padding: 20px 16px 48px;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
}
</style>
