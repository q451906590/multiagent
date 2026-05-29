<script setup>
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import LoginPanel from './components/LoginPanel.vue'
import AppSidebar from './components/AppSidebar.vue'
import { useAgents } from './composables/useAgents.js'
import { useAuth } from './composables/useAuth.js'

const route = useRoute()
const router = useRouter()
const { ensureLoaded, reset } = useAgents()
const { state: authState, isAuthenticated, logout } = useAuth()

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

const currentNavView = computed(() => {
  if (route.name === 'demo') {
    const menuKey = String(route.params.menuKey || '').trim()
    return menuKey ? `demo:${menuKey}` : 'demo'
  }
  return String(route.meta?.navKey || route.name || 'list')
})
const currentTitle = computed(() => String(route.meta?.title || '页面'))

function onLogout() {
  logout()
  reset()
  router.push({ name: 'agents' })
}

function handleSidebarNavigate(item) {
  const key = String(item?.key || '').trim()
  if (!key) return
  if (key.startsWith('demo:')) {
    const menuKey = key.slice(5)
    router.push({ name: 'demo', params: { menuKey } })
    return
  }
  const routeMap = {
    list: { name: 'agents' },
    importCenter: { name: 'import-center' },
    marketplace: { name: 'marketplace' },
    workflowBuilder: { name: 'workflow-list' },
    workflowMarketplace: { name: 'workflow-marketplace' },
  }
  const target = routeMap[key] || { name: 'agents' }
  router.push(target)
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
        <RouterView />
      </main>
    </div>
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

</style>
