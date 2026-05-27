<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AgentList from '../components/AgentList.vue'
import { useAgents } from '../composables/useAgents.js'

const router = useRouter()
const { agents, ensureLoaded } = useAgents()

function openChat(entry) {
  const agentId = String(entry?.id || '').trim()
  if (!agentId) return
  router.push({ name: 'agent-chat', params: { agentId } })
}

function openFloatingChat(entry) {
  openChat(entry)
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
</script>

<template>
  <AgentList
    :agents="agents"
    @open="openChat"
    @open-floating="openFloatingChat"
    @manage-extensions="openExtensions"
    @manage-delegations="openDelegations"
  />
</template>
