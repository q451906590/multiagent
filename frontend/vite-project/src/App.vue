<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import AgentList from './components/AgentList.vue'
import AgentChat from './components/AgentChat.vue'
import AgentExtensions from './components/AgentExtensions.vue'
import DelegationKeyManager from './components/DelegationKeyManager.vue'
import LoginPanel from './components/LoginPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import MarketplaceBrowse from './components/MarketplaceBrowse.vue'
import MarketplaceListingDetail from './components/MarketplaceListingDetail.vue'
import ImportCenter from './components/ImportCenter.vue'
import DemoPage from './components/DemoPage.vue'
import WorkflowBuilderPage from './views/WorkflowBuilderPage.vue'
import { useAgents } from './composables/useAgents.js'
import { useAuth } from './composables/useAuth.js'

const { agents, ensureLoaded, reset, getAgent } = useAgents()
const { state: authState, isAuthenticated, logout } = useAuth()

const view = ref({ name: 'list' })
const demoMeta = ref({
  title: '功能演示',
  description: '该菜单已按截图完成导航占位，功能将在后续迭代补齐。',
})
const fullscreenChatHostEl = ref(null)
const floatingChats = ref([])
const dragging = ref(false)
const dragState = ref({
  windowId: '',
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
})
const zSeed = ref(40)

const activeAgent = computed(() =>
  view.value.name === 'chat' || view.value.name === 'extensions' || view.value.name === 'delegations'
    ? getAgent(view.value.agentId)
    : null
)

function openChat(entry) {
  if (!entry) return
  const agentId = typeof entry === 'string' ? entry : entry.id
  if (!agentId) return
  view.value = { name: 'chat', agentId, windowMode: 'fullscreen' }
}

function backToList() {
  view.value = { name: 'list' }
}

function openExtensions(agentId) {
  view.value = { name: 'extensions', agentId }
}

function openDelegations(agentId) {
  view.value = { name: 'delegations', agentId }
}

function openMarketplaceDetail(templateId) {
  view.value = { name: 'marketplaceDetail', templateId }
}

function onLogout() {
  logout()
  reset()
  view.value = { name: 'list' }
}

function getDefaultFloatingRect(offsetIndex = 0) {
  if (typeof window === 'undefined') {
    return { width: 860, height: 680, left: 80, top: 80 }
  }
  const margin = 24
  const offset = Math.min(offsetIndex, 6) * 26
  const minWidth = 520
  const minHeight = 420
  const width = Math.max(minWidth, Math.min(860, window.innerWidth - margin * 2))
  const height = Math.max(minHeight, Math.min(680, window.innerHeight - margin * 2))
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, window.innerWidth - width - margin - offset))
  const top = Math.max(margin, Math.min(72 + offset, window.innerHeight - height - margin))
  return { width, height, left, top }
}

function clampFloatingRect(rect) {
  if (typeof window === 'undefined') return rect
  const margin = 8
  const minWidth = 420
  const minHeight = 320
  const maxWidth = Math.max(minWidth, window.innerWidth - margin * 2)
  const maxHeight = Math.max(minHeight, window.innerHeight - margin * 2)
  const width = Math.max(minWidth, Math.min(rect.width, maxWidth))
  const height = Math.max(minHeight, Math.min(rect.height, maxHeight))
  const maxLeft = Math.max(margin, window.innerWidth - width - margin)
  const maxTop = Math.max(margin, window.innerHeight - height - margin)
  const left = Math.max(margin, Math.min(rect.left, maxLeft))
  const top = Math.max(margin, Math.min(rect.top, maxTop))
  return { width, height, left, top }
}

function makeWindowId(agentId) {
  return `local:${agentId}`
}

function getFloatingWindowById(windowId) {
  return floatingChats.value.find((item) => item.windowId === windowId) || null
}

function touchFloatingWindow(windowId) {
  const item = getFloatingWindowById(windowId)
  if (!item) return
  zSeed.value += 1
  item.zIndex = zSeed.value
}

function syncFullscreenChatRectFromDom() {
  if (!fullscreenChatHostEl.value) return getDefaultFloatingRect(floatingChats.value.length)
  const { width, height, left, top } = fullscreenChatHostEl.value.getBoundingClientRect()
  return clampFloatingRect({ width, height, left, top })
}

function openFloatingChat(agentId, preferredRect = null) {
  const windowId = makeWindowId(agentId)
  const existing = getFloatingWindowById(windowId)
  if (existing) {
    touchFloatingWindow(windowId)
    return
  }
  zSeed.value += 1
  floatingChats.value.push({
    windowId,
    agentId,
    rect: clampFloatingRect(preferredRect || getDefaultFloatingRect(floatingChats.value.length)),
    zIndex: zSeed.value,
  })
}

function openFloatingChatFromList(entry) {
  if (!entry?.id) return
  openFloatingChat(entry.id)
}

function closeFloatingChat(windowId) {
  floatingChats.value = floatingChats.value.filter((item) => item.windowId !== windowId)
}

function openFullscreenFromFloating(item) {
  if (!item) return
  closeFloatingChat(item.windowId)
  openChat(item.agentId)
}

function shrinkFullscreenToFloating() {
  if (view.value.name !== 'chat' || !view.value.agentId) return
  const rect = syncFullscreenChatRectFromDom()
  const agentId = view.value.agentId
  view.value = { name: 'list' }
  openFloatingChat(agentId, rect)
}

function onFloatingPointerDown(windowId, event) {
  if (event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  if (!target?.closest('.chat-head')) return
  if (target.closest('button, input, textarea, select, a, label')) return

  const current = getFloatingWindowById(windowId)
  if (!current) return
  touchFloatingWindow(windowId)
  dragging.value = true
  const { left, top } = current.rect
  dragState.value = {
    windowId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: left,
    startTop: top,
  }
  window.addEventListener('pointermove', onChatPointerMove)
  window.addEventListener('pointerup', onChatPointerUp)
}

function onChatPointerMove(event) {
  if (!dragging.value) return
  const current = getFloatingWindowById(dragState.value.windowId)
  if (!current) return
  const dx = event.clientX - dragState.value.startX
  const dy = event.clientY - dragState.value.startY
  current.rect = clampFloatingRect({
    ...current.rect,
    left: dragState.value.startLeft + dx,
    top: dragState.value.startTop + dy,
  })
}

function onChatPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  dragState.value.windowId = ''
  window.removeEventListener('pointermove', onChatPointerMove)
  window.removeEventListener('pointerup', onChatPointerUp)
}

function onWindowResize() {
  floatingChats.value = floatingChats.value.map((item) => ({
    ...item,
    rect: clampFloatingRect(item.rect),
  }))
}

function onFloatingMouseUp(windowId, event) {
  const item = getFloatingWindowById(windowId)
  if (!item) return
  const el = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!el) return
  const { width, height, left, top } = el.getBoundingClientRect()
  item.rect = clampFloatingRect({ width, height, left, top })
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  onChatPointerUp()
})

watch(
  isAuthenticated,
  async (authed) => {
    if (authed) {
      await ensureLoaded()
    } else {
      reset()
    }
  },
  { immediate: true }
)

watch(
  agents,
  () => {
    floatingChats.value = floatingChats.value.filter((item) => Boolean(getAgent(item.agentId)))
    if (view.value.name !== 'list' && view.value.agentId && !getAgent(view.value.agentId)) {
      backToList()
    }
  },
  { deep: false }
)

const showList = computed(() => view.value.name === 'list')
const currentNavView = computed(() => {
  if (view.value.name === 'marketplaceDetail') return 'marketplace'
  if (['chat', 'extensions', 'delegations'].includes(view.value.name)) return 'list'
  if (view.value.name === 'demo') return view.value.menuKey || 'demo'
  return view.value.name
})

function handleSidebarNavigate(item) {
  if (!item?.key) return
  if (item.key.startsWith('demo:')) {
    view.value = {
      name: 'demo',
      menuKey: item.key,
    }
    demoMeta.value = {
      title: `${item.label}（Demo）`,
      description: '该菜单已按截图完成占位展示，当前版本先提供独立 Demo 页。',
    }
    return
  }
  view.value = { name: item.key }
}

function getFloatingStyle(item) {
  return {
    width: `${item.rect.width}px`,
    height: `${item.rect.height}px`,
    left: `${item.rect.left}px`,
    top: `${item.rect.top}px`,
    zIndex: item.zIndex,
  }
}
</script>

<template>
  <div v-if="!authState.ready" class="auth-loading">正在初始化登录状态…</div>
  <LoginPanel v-else-if="!isAuthenticated" />
  <div v-else class="app-shell">
    <AppSidebar :current-view="currentNavView" @navigate="handleSidebarNavigate" />
    <div class="content-shell">
      <header class="topbar">
        <div class="crumb">Agent平台 / {{ currentNavView }}</div>
        <button class="logout-btn" @click="onLogout">退出登录</button>
      </header>
      <main class="page-body">
        <AgentList
          v-if="showList"
          :agents="agents"
          @open="openChat"
          @open-floating="openFloatingChatFromList"
          @manage-extensions="openExtensions"
          @manage-delegations="openDelegations"
        />
        <MarketplaceBrowse
          v-if="view.name === 'marketplace'"
          @open-detail="openMarketplaceDetail"
        />
        <MarketplaceListingDetail
          v-if="view.name === 'marketplaceDetail'"
          :template-id="view.templateId"
        />
        <ImportCenter v-if="view.name === 'importCenter'" />
        <WorkflowBuilderPage v-if="view.name === 'workflowBuilder'" />
        <DemoPage
          v-if="view.name === 'demo'"
          :title="demoMeta.title"
          :description="demoMeta.description"
        />
      </main>
    </div>
    <div
      v-if="view.name === 'chat' && activeAgent"
      ref="fullscreenChatHostEl"
      class="chat-host fullscreen"
    >
      <AgentChat
        :agent="activeAgent"
        :window-mode="view.windowMode"
        @back="backToList"
        @toggle-window="shrinkFullscreenToFloating"
      />
    </div>
    <div
      v-for="item in floatingChats"
      :key="item.windowId"
      class="chat-host floating"
      :style="getFloatingStyle(item)"
      @pointerdown="onFloatingPointerDown(item.windowId, $event)"
      @mousedown="touchFloatingWindow(item.windowId)"
      @mouseup="onFloatingMouseUp(item.windowId, $event)"
    >
      <AgentChat
        v-if="getAgent(item.agentId)"
        :agent="getAgent(item.agentId)"
        window-mode="floating"
        @back="closeFloatingChat(item.windowId)"
        @toggle-window="openFullscreenFromFloating(item)"
        @request-fullscreen="openFullscreenFromFloating(item)"
      />
    </div>
    <AgentExtensions
      v-if="view.name === 'extensions' && activeAgent"
      :agent="activeAgent"
      @back="backToList"
    />
    <DelegationKeyManager
      v-if="view.name === 'delegations' && activeAgent"
      :agent="activeAgent"
      @back="backToList"
    />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: row;
  position: relative;
}

.auth-loading {
  min-height: 100vh;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}

.content-shell {
  flex: 1;
  min-width: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 52px;
  border-bottom: 1px solid var(--kd-line);
  background: var(--kd-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.crumb {
  color: var(--kd-text-muted);
  font-size: 12px;
}

.page-body {
  flex: 1;
  min-width: 0;
  background: var(--kd-bg);
  overflow: auto;
}

.logout-btn {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  background: var(--kd-surface);
  color: var(--kd-text);
  padding: 6px 12px;
  font-size: 12px;
}

.chat-host {
  position: fixed;
}

.chat-host.fullscreen {
  z-index: 35;
  inset: 0;
}

.chat-host.floating {
  z-index: 30;
  min-width: 420px;
  min-height: 320px;
  resize: both;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  background: var(--color-bg);
}
</style>
