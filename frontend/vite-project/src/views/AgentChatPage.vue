<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentChat from '../components/AgentChat.vue'
import { useAgents } from '../composables/useAgents.js'

const route = useRoute()
const router = useRouter()
const { getAgent, ensureLoaded } = useAgents()

const activeAgent = computed(() => {
  const id = String(route.params.agentId || '').trim()
  return id ? getAgent(id) : null
})

function backToList() {
  router.push({ name: 'agents' })
}

function onToggleWindow() {
  backToList()
}

onMounted(() => {
  ensureLoaded()
})
</script>

<template>
  <section class="chat-route">
    <div v-if="!activeAgent" class="missing">
      <p>未找到对应 Agent，可能已被删除。</p>
      <button class="back-btn" @click="backToList">返回调用工作台</button>
    </div>
    <AgentChat
      v-else
      :agent="activeAgent"
      window-mode="fullscreen"
      @back="backToList"
      @toggle-window="onToggleWindow"
      @request-fullscreen="() => {}"
    />
  </section>
</template>

<style scoped>
.chat-route {
  min-height: calc(100vh - 52px);
}

.missing {
  min-height: calc(100vh - 52px);
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
}

.back-btn {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--kd-surface);
}
</style>
