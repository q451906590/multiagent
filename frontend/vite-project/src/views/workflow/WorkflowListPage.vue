<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflow } from '../../composables/useWorkflow.js'

const router = useRouter()
const {
  state,
  ensureLoaded,
  createNewWorkflow,
  removeWorkflow,
} = useWorkflow()

const workflows = computed(() => (Array.isArray(state.list) ? state.list : []))

function formatTime(ts) {
  const n = Number(ts || 0)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return new Date(n).toLocaleString()
}

async function handleCreateWorkflow() {
  const created = await createNewWorkflow({ name: `工作流-${workflows.value.length + 1}` })
  if (created?.id) {
    router.push({ name: 'workflow-detail', params: { workflowId: created.id } })
  }
}

function openWorkflow(id) {
  const workflowId = String(id || '').trim()
  if (!workflowId) return
  router.push({ name: 'workflow-detail', params: { workflowId } })
}

async function deleteWorkflow(id) {
  const workflowId = String(id || '').trim()
  if (!workflowId) return
  if (!window.confirm('确定删除该工作流吗？')) return
  await removeWorkflow(workflowId)
}

onMounted(() => {
  ensureLoaded()
})
</script>

<template>
  <section class="workflow-list-page">
    <header class="head">
      <h2>工作流管理</h2>
      <button class="btn" @click="handleCreateWorkflow">新增工作流</button>
    </header>

    <p v-if="state.error" class="error">加载失败：{{ state.error }}</p>
    <p v-else-if="state.loading" class="tip">工作流加载中…</p>

    <div class="grid">
      <article class="card add-card" @click="handleCreateWorkflow">
        <div class="plus">+</div>
        <h3>新增工作流</h3>
        <p>创建一个新的工作流并进入编辑页面。</p>
      </article>

      <article
        v-for="item in workflows"
        :key="item.id"
        class="card"
      >
        <h3>{{ item.name || item.id }}</h3>
        <p class="desc">{{ item.description || '暂无描述' }}</p>
        <div class="meta">
          <span>状态：{{ item.publishStatus || 'draft' }}</span>
          <span>更新时间：{{ formatTime(item.updatedAt) }}</span>
        </div>
        <div class="actions">
          <button class="btn" @click="openWorkflow(item.id)">进入工作流</button>
          <button class="btn danger" @click="deleteWorkflow(item.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.workflow-list-page {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 40px 48px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

h2 {
  margin: 0;
}

.tip {
  margin: 0 0 12px;
  color: var(--kd-text-muted);
}

.error {
  margin: 0 0 12px;
  color: #be2d33;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.card {
  border: 1px solid var(--kd-line);
  border-radius: 14px;
  background: var(--kd-surface);
  padding: 14px;
  display: grid;
  gap: 10px;
}

.card h3 {
  margin: 0;
}

.desc {
  margin: 0;
  color: var(--kd-text-soft);
  min-height: 34px;
}

.meta {
  display: grid;
  gap: 4px;
  color: var(--kd-text-muted);
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  background: #fff;
  padding: 7px 10px;
}

.btn.danger {
  color: #be2d33;
  border-color: #f2c5c7;
}

.add-card {
  cursor: pointer;
  place-items: center;
  text-align: center;
  border-style: dashed;
}

.plus {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid var(--kd-line);
  font-size: 22px;
  line-height: 1;
}

@media (max-width: 720px) {
  .workflow-list-page {
    padding: 20px 16px 36px;
  }
}
</style>
