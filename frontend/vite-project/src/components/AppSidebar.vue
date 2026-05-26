<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentView: { type: String, required: true },
})

const emit = defineEmits(['navigate'])

const menuGroups = [
  {
    title: '工作区',
    items: [
      { key: 'list', label: '调用工作台', icon: '□', core: true },
      { key: 'importCenter', label: '导入中心', icon: '⇣', core: true },
      { key: 'marketplace', label: 'Agent 市场', icon: '◈', core: true },
      { key: 'workflowBuilder', label: '搭建工作流', icon: '◇', core: true },
    ],
  },
  {
    title: '扩展功能',
    items: [
      { key: 'demo:assetCenter', label: '创作后台', icon: '◇' },
      { key: 'demo:pointMall', label: '积分商城', icon: '◇' },
      { key: 'demo:safety', label: '审核与安全', icon: '◇' },
      { key: 'demo:analytics', label: '数据洞察', icon: '◇' },
    ],
  },
]

const activeKey = computed(() => props.currentView)

function onClick(item) {
  emit('navigate', item)
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="logo">M</div>
      <div>
        <div class="brand-title">WPS Agent共享平台</div>
        <div class="brand-sub">企业级 Agent 工作台</div>
      </div>
    </div>

    <nav class="nav">
      <section v-for="group in menuGroups" :key="group.title" class="group">
        <header class="group-title">{{ group.title }}</header>
        <button
          v-for="item in group.items"
          :key="item.key"
          class="menu-item"
          :class="{ active: activeKey === item.key }"
          @click="onClick(item)"
        >
          <span class="icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
          <span v-if="!item.core" class="demo-badge">DEMO</span>
        </button>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 212px;
  min-height: 100vh;
  background: var(--kd-surface);
  border-right: 1px solid var(--kd-line);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px 10px;
}

.logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--kd-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.brand-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--kd-text);
}

.brand-sub {
  font-size: 11px;
  color: var(--kd-text-muted);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group {
  display: grid;
  gap: 4px;
}

.group-title {
  font-size: 11px;
  color: var(--kd-text-muted);
  padding: 0 8px;
  margin-bottom: 2px;
}

.menu-item {
  height: 32px;
  border-radius: 8px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--kd-text-soft);
  justify-content: flex-start;
}

.menu-item:hover {
  background: var(--kd-hover);
  color: var(--kd-text);
}

.menu-item.active {
  background: rgba(10, 108, 255, 0.08);
  color: var(--kd-primary);
  font-weight: 600;
}

.icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
}

.demo-badge {
  margin-left: auto;
  font-size: 10px;
  border-radius: 999px;
  border: 1px solid var(--kd-line);
  color: var(--kd-text-muted);
  padding: 0 6px;
  line-height: 16px;
}
</style>
