<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMarketplace } from '../composables/useMarketplace.js'

const emit = defineEmits(['back', 'open-detail'])
const { state, loadMarketplace } = useMarketplace()
const keyword = ref('')

onMounted(() => {
  loadMarketplace().catch(() => {})
})

const filteredItems = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return state.items
  return state.items.filter((item) => {
    const text = `${item.title || ''} ${item.description || ''} ${item.publisherUsername || ''}`.toLowerCase()
    return text.includes(key)
  })
})
</script>

<template>
  <section class="market">
    <header class="head">
      <button class="back-btn" @click="emit('back')">返回工作区</button>
      <h2>Agent 市集</h2>
      <input v-model="keyword" class="search" placeholder="搜索标题 / 作者 / 简介" />
    </header>

    <p v-if="state.error" class="error">{{ state.error }}</p>
    <p v-else-if="state.loading" class="loading">正在加载市集列表…</p>
    <p v-else-if="filteredItems.length === 0" class="loading">暂无可用 Agent 模板</p>

    <div v-else class="grid">
      <article v-for="item in filteredItems" :key="item.id" class="card">
        <div class="title-row">
          <span class="emoji">{{ item.emoji || '🤖' }}</span>
          <div class="title">{{ item.title }}</div>
        </div>
        <p class="desc">{{ item.description || '暂无简介' }}</p>
        <div class="meta">
          <span>作者：{{ item.publisherUsername || '匿名' }}</span>
          <span>接入：{{ item.installCount || 0 }}</span>
        </div>
        <button class="detail-btn" @click="emit('open-detail', item.id)">查看详情</button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.market {
  padding: 28px 40px 48px;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}

.head {
  display: grid;
  grid-template-columns: auto 1fr minmax(220px, 360px);
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

h2 {
  margin: 0;
}

.back-btn,
.detail-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 7px 12px;
  background: var(--color-surface);
}

.detail-btn {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.search {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 9px 14px;
}

.loading,
.error {
  color: var(--color-text-soft);
}

.error {
  color: var(--color-danger);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: 14px;
  display: grid;
  gap: 10px;
}

.title-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.title {
  font-weight: 600;
}

.desc {
  margin: 0;
  color: var(--color-text-soft);
  font-size: 13px;
  min-height: 36px;
}

.meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
