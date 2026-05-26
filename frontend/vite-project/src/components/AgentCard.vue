<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  mode: { type: String, default: 'agent' },
  agent: { type: Object, default: null },
})

const emit = defineEmits(['open', 'open-floating', 'delete', 'add', 'edit', 'manage', 'delegations', 'publish'])

const isAdd = computed(() => props.mode === 'add')
const openHint = computed(() => '双击进入对话')
const normalizedName = computed(() => String(props.agent?.name || '').trim())
const normalizedRole = computed(() => String(props.agent?.role || '').trim())
const normalizedPrompt = computed(() => String(props.agent?.systemPrompt || '').trim())
const displayRole = computed(() => {
  if (!normalizedRole.value) return ''
  if (normalizedRole.value === normalizedName.value) return ''
  return normalizedRole.value
})
const displayPrompt = computed(() => {
  if (!normalizedPrompt.value) return ''
  if (normalizedPrompt.value === normalizedName.value) return ''
  if (normalizedPrompt.value === normalizedRole.value) return ''
  return normalizedPrompt.value
})
const showPromptPlaceholder = computed(() => !normalizedPrompt.value)
const isMarketplaceImported = computed(() => Boolean(props.agent?.sourceTemplateId))
const marketplaceHint = computed(() => {
  if (!isMarketplaceImported.value) return ''
  const version = String(props.agent?.sourceTemplateVersion || '').trim()
  if (!version) return '该 Agent 从市集引入'
  return `该 Agent 从市集引入（模板版本：${version}）`
})
const cardEl = ref(null)
const showMore = ref(false)

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

function toggleMore() {
  showMore.value = !showMore.value
}

function closeMore() {
  showMore.value = false
}

function onDocumentClick(event) {
  if (!showMore.value) return
  const root = cardEl.value
  if (!root) return
  const target = event.target instanceof Node ? event.target : null
  if (target && !root.contains(target)) {
    closeMore()
  }
}

function withClose(fn) {
  return () => {
    fn()
    closeMore()
  }
}

const onManageWithClose = withClose(onManage)
const onDelegationsWithClose = withClose(onDelegations)
const onEditWithClose = withClose(onEdit)
const onOpenFloatingWithClose = withClose(onOpenFloating)
const onPublishWithClose = withClose(onPublish)
const onDeleteWithClose = withClose(onDelete)

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
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
    ref="cardEl"
    class="card card-agent"
    role="button"
    tabindex="0"
    :title="`${openHint}：${agent.name}`"
    @dblclick="onDblClick"
    @keydown.enter.prevent="onDblClick"
  >
    <div class="card-actions">
      <button class="more-btn" title="更多操作" @click.stop="toggleMore">...</button>
      <div v-if="showMore" class="more-menu" @click.stop>
        <button class="menu-item" @click.stop="onManageWithClose">扩展管理</button>
        <button class="menu-item" @click.stop="onDelegationsWithClose">外派 AK 管理</button>
        <button class="menu-item" @click.stop="onEditWithClose">编辑</button>
        <button class="menu-item" @click.stop="onOpenFloatingWithClose">打开小窗口</button>
        <button
          v-if="!isMarketplaceImported"
          class="menu-item"
          @click.stop="onPublishWithClose"
        >
          发布到市集
        </button>
        <div
          v-else
          class="menu-note"
          title="市集引入的 Agent 不支持再次发布到市集"
        >
          已从市集引入，不可再发布
        </div>
        <button class="menu-item danger" @click.stop="onDeleteWithClose">删除</button>
      </div>
    </div>

    <div class="card-head">
      <div class="avatar">{{ agent.emoji || '🤖' }}</div>
      <div class="head-text">
        <div class="name-row">
          <div class="name">{{ agent.name }}</div>
        </div>
        <div
          v-if="isMarketplaceImported || agent.delegationEligible"
          class="meta-row"
        >
          <span
            v-if="isMarketplaceImported"
            class="source-badge marketplace"
            :title="marketplaceHint"
          >
            市集引入
          </span>
          <span v-if="agent.delegationEligible" class="source-badge" title="可用于外派调用">
            可外派
          </span>
        </div>
        <div v-if="displayRole" class="role">{{ displayRole }}</div>
      </div>
    </div>

    <div v-if="displayPrompt" class="prompt">{{ displayPrompt }}</div>
    <div v-else-if="showPromptPlaceholder" class="prompt prompt-empty">（未填写 system prompt）</div>

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
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.more-btn {
  min-width: 28px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 8px 3px;
}

.more-btn:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
  background: var(--color-surface-soft);
}

.more-menu {
  min-width: 130px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  padding: 4px;
  display: grid;
  gap: 2px;
}

.menu-item {
  text-align: left;
  border-radius: 8px;
  padding: 7px 8px;
  color: var(--color-text-soft);
  font-size: 12px;
}

.menu-item:hover {
  background: var(--color-surface-soft);
  color: var(--color-text);
}

.menu-item.danger {
  color: var(--color-danger);
}

.menu-note {
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 42px;
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
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.name-row {
  display: flex;
  align-items: center;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.source-badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  color: var(--color-text-soft);
}

.source-badge.marketplace {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
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
