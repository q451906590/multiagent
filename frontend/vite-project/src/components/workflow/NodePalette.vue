<script setup>
import { computed } from 'vue'

const props = defineProps({
  agents: { type: Array, default: () => [] },
})

const emit = defineEmits(['add-node'])

const baseNodes = computed(() => ([
  { type: 'if', label: '条件分支 IF', icon: '◇' },
  { type: 'switch', label: '分支 Switch', icon: '⎇' },
  { type: 'merge', label: '合并 Merge', icon: '⋈' },
  { type: 'wait', label: '等待 Wait', icon: '◴' },
]))

const agentNodes = computed(() =>
  (Array.isArray(props.agents) ? props.agents : []).map((agent) => ({
    type: 'agent',
    label: `${agent.emoji || '🤖'} ${agent.name || agent.id}`,
    icon: '🤖',
    data: {
      agentId: agent.id,
      prompt: '',
      uploadedFiles: [],
      timeoutMs: 0,
    },
  }))
)

function onAdd(definition) {
  emit('add-node', definition)
}
</script>

<template>
  <aside class="node-palette">
    <h3>节点库</h3>
    <div class="group">
      <header>通用节点（n8n）</header>
      <button
        v-for="node in baseNodes"
        :key="node.type"
        class="node-btn"
        @click="onAdd(node)"
      >
        <span>{{ node.icon }}</span>
        <span>{{ node.label }}</span>
      </button>
    </div>
    <div class="group">
      <header>Agent 节点</header>
      <button
        v-for="node in agentNodes"
        :key="node.data.agentId"
        class="node-btn"
        @click="onAdd(node)"
      >
        <span>{{ node.icon }}</span>
        <span>{{ node.label }}</span>
      </button>
      <p v-if="!agentNodes.length" class="hint">暂无可用 Agent，请先在调用工作台创建。</p>
    </div>
  </aside>
</template>

<style scoped>
.node-palette {
  width: 280px;
  flex: 0 0 280px;
  background: var(--kd-surface);
  border: 1px solid var(--kd-line);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 12px;
  align-content: start;
}

h3 {
  margin: 0;
  font-size: 14px;
}

.group {
  display: grid;
  gap: 8px;
}

.group > header {
  font-size: 12px;
  color: var(--kd-text-muted);
}

.node-btn {
  height: 32px;
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  justify-content: flex-start;
}

.node-btn:hover {
  border-color: var(--kd-primary);
  color: var(--kd-primary);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--kd-text-muted);
}
</style>
