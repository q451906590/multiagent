<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentExtensions from '../components/AgentExtensions.vue'
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

onMounted(() => {
  ensureLoaded()
})
</script>

<template>
  <section>
    <div v-if="!activeAgent" class="missing">
      <p>未找到对应 Agent，可能已被删除。</p>
      <button class="back-btn" @click="backToList">返回调用工作台</button>
    </div>
    <AgentExtensions v-else :agent="activeAgent" @back="backToList" />
  </section>
</template>

<style scoped>
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
