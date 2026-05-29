<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AgentList from '../components/AgentList.vue'
import AgentChat from '../components/AgentChat.vue'
import { useAgents } from '../composables/useAgents.js'

const router = useRouter()
const { agents, getAgent, ensureLoaded } = useAgents()
const floatingAgentId = ref('')
const floatingPanelEl = ref(null)
const floatingPanelPosition = ref(null)
const dragState = ref({ active: false, offsetX: 0, offsetY: 0 })

const floatingAgent = computed(() => {
  const id = String(floatingAgentId.value || '').trim()
  return id ? getAgent(id) : null
})

const floatingPanelStyle = computed(() => {
  const pos = floatingPanelPosition.value
  if (!pos) return {}
  return {
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    right: 'auto',
    bottom: 'auto',
  }
})

function clampPosition(x, y) {
  const el = floatingPanelEl.value
  const rect = el?.getBoundingClientRect()
  const panelWidth = rect?.width || Math.min(960, Math.max(320, window.innerWidth - 32))
  const panelHeight = rect?.height || Math.min(720, Math.max(320, window.innerHeight - 88))
  const minX = 12
  const minY = 12
  const maxX = Math.max(minX, window.innerWidth - panelWidth - 12)
  const maxY = Math.max(minY, window.innerHeight - panelHeight - 12)
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  }
}

async function resetFloatingPanelPosition() {
  await nextTick()
  const el = floatingPanelEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const target = clampPosition(window.innerWidth - rect.width - 24, window.innerHeight - rect.height - 24)
  floatingPanelPosition.value = target
}

function openChat(entry) {
  const agentId = String(entry?.id || '').trim()
  if (!agentId) return
  floatingAgentId.value = ''
  router.push({ name: 'agent-chat', params: { agentId } })
}

function openFloatingChat(entry) {
  const agentId = String(entry?.id || '').trim()
  if (!agentId) return
  floatingAgentId.value = agentId
}

function closeFloatingChat() {
  floatingAgentId.value = ''
}

function requestFloatingFullscreen() {
  const agentId = String(floatingAgentId.value || '').trim()
  if (!agentId) return
  floatingAgentId.value = ''
  router.push({ name: 'agent-chat', params: { agentId } })
}

function stopDragging() {
  if (!dragState.value.active) return
  dragState.value = { active: false, offsetX: 0, offsetY: 0 }
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDragging)
}

function onPointerMove(event) {
  if (!dragState.value.active) return
  const nextX = event.clientX - dragState.value.offsetX
  const nextY = event.clientY - dragState.value.offsetY
  floatingPanelPosition.value = clampPosition(nextX, nextY)
}

function onFloatingPanelPointerDown(event) {
  const target = event.target instanceof Element ? event.target : null
  const header = target?.closest('.chat-head')
  if (!header) return
  const interactive = target?.closest('button, a, input, textarea, select, label')
  if (interactive) return
  if (!floatingPanelPosition.value) return
  event.preventDefault()
  dragState.value = {
    active: true,
    offsetX: event.clientX - floatingPanelPosition.value.x,
    offsetY: event.clientY - floatingPanelPosition.value.y,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDragging)
}

function openExtensions(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return
  router.push({ name: 'agent-extensions', params: { agentId: id } })
}

function openDelegations(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return
  router.push({ name: 'agent-delegations', params: { agentId: id } })
}

onMounted(() => {
  ensureLoaded()
})

function onKeydown(event) {
  if (event.key === 'Escape' && floatingAgent.value) {
    closeFloatingChat()
  }
}

function onResize() {
  if (!floatingAgent.value) return
  const pos = floatingPanelPosition.value
  if (!pos) {
    resetFloatingPanelPosition()
    return
  }
  floatingPanelPosition.value = clampPosition(pos.x, pos.y)
}

watch(
  () => floatingAgentId.value,
  async (nextId, prevId) => {
    if (!nextId) {
      stopDragging()
      floatingPanelPosition.value = null
      return
    }
    if (nextId !== prevId) {
      await resetFloatingPanelPosition()
    } else if (!floatingPanelPosition.value) {
      await resetFloatingPanelPosition()
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  stopDragging()
})
</script>

<template>
  <section class="workspace-page">
    <AgentList
      :agents="agents"
      @open="openChat"
      @open-floating="openFloatingChat"
      @manage-extensions="openExtensions"
      @manage-delegations="openDelegations"
    />

    <div v-if="floatingAgent" class="floating-wrap">
      <div class="floating-mask"></div>
      <section
        ref="floatingPanelEl"
        class="floating-panel"
        :style="floatingPanelStyle"
        @pointerdown="onFloatingPanelPointerDown"
      >
        <AgentChat
          :agent="floatingAgent"
          window-mode="floating"
          @back="closeFloatingChat"
          @toggle-window="requestFloatingFullscreen"
          @request-fullscreen="requestFloatingFullscreen"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.workspace-page {
  position: relative;
  min-height: calc(100vh - 52px);
}

.floating-wrap {
  position: fixed;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}

.floating-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}

.floating-panel {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: min(960px, calc(100vw - 32px));
  height: min(720px, calc(100vh - 88px));
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  background: var(--color-bg);
  pointer-events: auto;
}

@media (max-width: 900px) {
  .floating-panel {
    right: 12px;
    left: 12px;
    width: auto;
    bottom: 12px;
    height: min(78vh, 680px);
  }
}
</style>
