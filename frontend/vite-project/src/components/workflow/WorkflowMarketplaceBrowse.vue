<script setup>
import { computed, onMounted, ref } from 'vue'
import { useWorkflowMarketplace } from '../../composables/useWorkflowMarketplace.js'

const emit = defineEmits(['open-detail'])
const {
  state,
  loadMarketplace,
  loadTags,
  setSelectedTagIds,
} = useWorkflowMarketplace()
const keyword = ref('')

onMounted(async () => {
  await Promise.allSettled([loadTags(), loadMarketplace()])
})

const filteredItems = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return state.items
  return state.items.filter((item) => {
    const text = `${item.title || ''} ${item.description || ''} ${item.publisherUsername || ''}`.toLowerCase()
    return text.includes(key)
  })
})

function toggleTagFilter(tagId) {
  const selected = new Set(state.selectedTagIds)
  if (selected.has(tagId)) selected.delete(tagId)
  else selected.add(tagId)
  setSelectedTagIds([...selected])
  loadMarketplace(true).catch(() => {})
}
</script>

<template>
  <section class="market">
    <header class="head">
      <h2>工作流市集</h2>
      <input v-model="keyword" class="search" placeholder="搜索标题 / 作者 / 简介" />
    </header>

    <div class="tag-filter-row">
      <button
        v-for="tag in state.tags"
        :key="tag.id"
        class="tag-chip"
        :class="{ active: state.selectedTagIds.includes(tag.id) }"
        @click="toggleTagFilter(tag.id)"
      >
        {{ tag.name }}
      </button>
      <span v-if="!state.tags.length" class="tag-empty">暂无标签</span>
    </div>

    <p v-if="state.error" class="error">{{ state.error }}</p>
    <p v-else-if="state.loading" class="loading">正在加载市集列表…</p>
    <p v-else-if="filteredItems.length === 0" class="loading">暂无可用工作流模板</p>

    <div v-else class="grid">
      <article v-for="item in filteredItems" :key="item.id" class="card">
        <div class="title">{{ item.title }}</div>
        <p class="desc">{{ item.description || '暂无简介' }}</p>
        <div class="card-tags">
          <span v-for="tag in item.tags || []" :key="tag.id" class="card-tag">{{ tag.name }}</span>
        </div>
        <div class="meta">
          <span>作者：{{ item.publisherUsername || '匿名' }}</span>
          <span>节点：{{ item.nodeCount || 0 }}</span>
        </div>
        <div class="meta">
          <span>连线：{{ item.edgeCount || 0 }}</span>
          <span>安装：{{ item.installCount || 0 }}</span>
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
  grid-template-columns: auto minmax(220px, 360px);
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

h2 { margin: 0; }

.search {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 9px 14px;
}

.detail-btn {
  border: 1px solid var(--kd-primary);
  color: var(--kd-primary);
  border-radius: 999px;
  padding: 7px 12px;
  background: var(--kd-surface);
}

.tag-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tag-chip {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--kd-surface);
  color: var(--kd-text-soft);
}

.tag-chip.active {
  border-color: var(--kd-primary);
  background: rgba(10, 108, 255, 0.08);
  color: var(--kd-primary);
}

.tag-empty { color: var(--kd-text-muted); font-size: 12px; }
.loading,.error { color: var(--kd-text-soft); }
.error { color: var(--color-danger); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--kd-line);
  border-radius: var(--radius-lg);
  background: var(--kd-surface);
  padding: 14px;
  display: grid;
  gap: 10px;
}

.title { font-weight: 600; }
.desc { margin: 0; color: var(--kd-text-soft); font-size: 13px; min-height: 36px; }

.card-tags { display: flex; flex-wrap: wrap; gap: 8px; min-height: 24px; }
.card-tag {
  border-radius: 999px;
  border: 1px solid var(--kd-line);
  background: var(--kd-hover);
  color: var(--kd-text-soft);
  font-size: 12px;
  padding: 2px 8px;
}

.meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--kd-text-muted);
}
</style>
