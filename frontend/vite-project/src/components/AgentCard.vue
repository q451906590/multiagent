<script setup>
import { computed } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'agent' },
  agent: { type: Object, default: null },
})

const emit = defineEmits(['open', 'open-floating', 'delete', 'add', 'edit', 'manage', 'delegations', 'publish'])

const isAdd = computed(() => props.mode === 'add')
const openHint = computed(() => '双击进入对话')

function onDblClick() {
  if (!isAdd.value) emit('open', props.agent)
}

function onClickAdd() {
  if (isAdd.value) emit('add')
}

function onDelete() {
  emit('delete', props.agent)
}

function onEdit() {
  emit('edit', props.agent.id)
}

function onManage() {
  emit('manage', props.agent.id)
}

function onDelegations() {
  emit('delegations', props.agent.id)
}

function onOpenFloating() {
  emit('open-floating', props.agent)
}

function onPublish() {
  emit('publish', props.agent)
}
</script>

<template>
  <div
    v-if="isAdd"
    class="card card-add"
    role="button"
    tabindex="0"
    @click="onClickAdd"
    @keydown.enter.prevent="onClickAdd"
    @keydown.space.prevent="onClickAdd"
  >
    <div class="add-icon">
      <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <div class="add-label">添加 Agent</div>
  </div>

  <div
    v-else
    class="card card-agent"
    role="button"
    tabindex="0"
    :title="`${openHint}：${agent.name}`"
    @dblclick="onDblClick"
    @keydown.enter.prevent="onDblClick"
  >
    <div class="card-actions">
      <button class="action-btn" title="扩展管理" @click.stop="onManage">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M10 3h4l1 2 2 1v4l-2 1-1 2h-4l-1-2-2-1V6l2-1 1-2z M12 8.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <button class="action-btn" title="外派 AK 管理" @click.stop="onDelegations">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M7 11a4 4 0 1 1 7.8 1.2L21 18.4 18.4 21l-6.2-6.2A4 4 0 0 1 7 11z M11 9.5v3"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <button class="action-btn" title="编辑" @click.stop="onEdit">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M4 20h4l10-10-4-4L4 16v4z M14 6l4 4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <button class="action-btn" title="打开小窗口" @click.stop="onOpenFloating">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M4 4h16v16H4z M8 8h8v8H8z"
            stroke="currentColor"
            stroke-width="1.6"
            fill="none"
          />
        </svg>
      </button>
      <button class="action-btn" title="发布到市集" @click.stop="onPublish">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M12 4v10M8 8l4-4 4 4M5 16h14v4H5z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <button class="action-btn delete-btn" title="删除" @click.stop="onDelete">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>

    <div class="card-head">
      <div class="avatar">{{ agent.emoji || '🤖' }}</div>
      <div class="head-text">
        <div class="name-row">
          <div class="name">{{ agent.name }}</div>
          <span v-if="agent.delegationEligible" class="source-badge" title="可用于外派调用">
            可外派
          </span>
        </div>
        <div v-if="agent.role" class="role">{{ agent.role }}</div>
      </div>
    </div>

    <div class="prompt">{{ agent.systemPrompt || '（未填写 system prompt）' }}</div>

    <div class="card-foot">
      <span class="model-tag">{{ agent.model }}</span>
      <span class="hint">{{ openHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  user-select: none;
  cursor: pointer;
  height: 180px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-border-strong);
  transform: translateY(-2px);
}

.card-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.card-agent:hover .card-actions,
.card-agent:focus-within .card-actions {
  opacity: 1;
}

.action-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, color 0.18s ease;
}

.action-btn:hover {
  background: var(--color-surface-soft);
  color: var(--color-text);
}

.delete-btn:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 132px;
}

.avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-primary-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
}

.head-text {
  min-width: 0;
  flex: 1;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  color: var(--color-text-soft);
}

.role {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-soft);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
}

.model-tag {
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--color-text-soft);
  font-weight: 500;
}

.hint {
  font-style: italic;
}

.card-add {
  border-style: dashed;
  background: transparent;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  text-align: center;
}

.card-add:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.add-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card-add:hover .add-icon {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.add-label {
  font-size: 13px;
  font-weight: 500;
}
</style>
