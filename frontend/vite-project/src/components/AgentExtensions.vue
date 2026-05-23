<script setup>
import { ref, computed } from 'vue'
import McpManager from './McpManager.vue'
import SkillsManager from './SkillsManager.vue'

const props = defineProps({
  agent: { type: Object, required: true },
})

const emit = defineEmits(['back'])
const tab = ref('mcp')
const title = computed(() => `${props.agent.emoji || '🤖'} ${props.agent.name}`)
</script>

<template>
  <section class="extensions-page">
    <header class="topbar">
      <div class="left">
        <button class="back-btn" @click="emit('back')">返回 Agent 列表</button>
        <div class="title-wrap">
          <h2>扩展管理</h2>
          <p>{{ title }}</p>
        </div>
      </div>
      <div class="tabs">
        <button :class="['tab', { active: tab === 'mcp' }]" @click="tab = 'mcp'">MCP</button>
        <button :class="['tab', { active: tab === 'skills' }]" @click="tab = 'skills'">Skills</button>
      </div>
    </header>

    <McpManager v-if="tab === 'mcp'" :agent-id="agent.id" />
    <SkillsManager v-else :agent-id="agent.id" />
  </section>
</template>

<style scoped>
.extensions-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 40px 48px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.title-wrap h2 {
  margin: 0;
  font-size: 20px;
}

.title-wrap p {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.tabs {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 2px;
  background: var(--color-surface-soft);
}

.tab {
  padding: 6px 14px;
  border-radius: 999px;
  color: var(--color-text-soft);
}

.tab.active {
  background: var(--color-surface);
  color: var(--color-text);
}
</style>
