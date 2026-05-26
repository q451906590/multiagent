<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useMarketplace } from '../composables/useMarketplace.js'

const emit = defineEmits(['open-detail'])
const {
  state,
  loadMarketplace,
  loadTags,
  setSelectedTagIds,
  createTag,
  renameTag,
  removeTag,
} = useMarketplace()
const keyword = ref('')
const tagDraft = ref('')
const tagManagerOpen = ref(false)
const editState = reactive({
  id: '',
  name: '',
})

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
  const next = [...selected]
  setSelectedTagIds(next)
  loadMarketplace(true).catch(() => {})
}

async function createTagByDraft() {
  const name = tagDraft.value.trim()
  if (!name) return
  try {
    await createTag(name)
    tagDraft.value = ''
  } catch (err) {
    window.alert(`创建标签失败：${err?.message || err}`)
  }
}

function beginEditTag(tag) {
  editState.id = tag.id
  editState.name = tag.name
}

async function submitEditTag() {
  if (!editState.id) return
  try {
    await renameTag(editState.id, editState.name)
    editState.id = ''
    editState.name = ''
  } catch (err) {
    window.alert(`编辑标签失败：${err?.message || err}`)
  }
}

async function onDeleteTag(tagId) {
  if (!window.confirm('确认删除该标签吗？删除后会从已发布模板上移除该标签。')) return
  try {
    await removeTag(tagId)
  } catch (err) {
    window.alert(`删除标签失败：${err?.message || err}`)
  }
}
</script>

<template>
  <section class="market">
    <header class="head">
      <h2>Agent 市集</h2>
      <input v-model="keyword" class="search" placeholder="搜索标题 / 作者 / 简介" />
      <button class="tag-manage-btn" @click="tagManagerOpen = true">标签管理</button>
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
      <span v-if="!state.tags.length" class="tag-empty">暂无标签，可点击“标签管理”创建</span>
    </div>

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
        <div class="card-tags">
          <span v-for="tag in item.tags || []" :key="tag.id" class="card-tag">{{ tag.name }}</span>
        </div>
        <div class="meta">
          <span>作者：{{ item.publisherUsername || '匿名' }}</span>
          <span>接入：{{ item.installCount || 0 }}</span>
        </div>
        <button class="detail-btn" @click="emit('open-detail', item.id)">查看详情</button>
      </article>
    </div>

    <div v-if="tagManagerOpen" class="mask" @click.self="tagManagerOpen = false">
      <div class="tag-dialog">
        <h3>标签管理</h3>
        <div class="tag-create">
          <input v-model="tagDraft" placeholder="输入新标签名称" />
          <button @click="createTagByDraft">新增</button>
        </div>
        <div class="tag-list">
          <div v-for="tag in state.tags" :key="tag.id" class="tag-row">
            <template v-if="editState.id === tag.id">
              <input v-model="editState.name" />
              <button @click="submitEditTag">保存</button>
              <button @click="editState.id = ''">取消</button>
            </template>
            <template v-else>
              <span>{{ tag.name }}</span>
              <div class="ops">
                <button @click="beginEditTag(tag)">编辑</button>
                <button class="danger" @click="onDeleteTag(tag.id)">删除</button>
              </div>
            </template>
          </div>
        </div>
      </div>
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
  grid-template-columns: auto minmax(220px, 360px) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

h2 {
  margin: 0;
}

.detail-btn {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 7px 12px;
  background: var(--kd-surface);
}

.detail-btn {
  border-color: var(--kd-primary);
  color: var(--kd-primary);
}

.search {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 9px 14px;
}

.tag-manage-btn {
  border: 1px solid var(--kd-line);
  border-radius: 999px;
  padding: 8px 12px;
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

.tag-empty {
  color: var(--kd-text-muted);
  font-size: 12px;
}

.loading,
.error {
  color: var(--kd-text-soft);
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
  border: 1px solid var(--kd-line);
  border-radius: var(--radius-lg);
  background: var(--kd-surface);
  padding: 14px;
  display: grid;
  gap: 10px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 24px;
}

.card-tag {
  border-radius: 999px;
  border: 1px solid var(--kd-line);
  background: var(--kd-hover);
  color: var(--kd-text-soft);
  font-size: 12px;
  padding: 2px 8px;
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
  color: var(--kd-text-soft);
  font-size: 13px;
  min-height: 36px;
}

.meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--kd-text-muted);
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 40, 0.45);
  display: grid;
  place-items: center;
  z-index: 100;
}

.tag-dialog {
  width: min(620px, calc(100vw - 24px));
  background: var(--kd-surface);
  border: 1px solid var(--kd-line);
  border-radius: var(--radius-lg);
  padding: 18px;
  display: grid;
  gap: 12px;
}

.tag-dialog h3 {
  margin: 0;
}

.tag-create {
  display: flex;
  gap: 8px;
}

.tag-create input,
.tag-row input {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 0;
}

.tag-create button,
.tag-row button {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  background: var(--kd-surface);
  padding: 6px 10px;
}

.tag-list {
  display: grid;
  gap: 8px;
  max-height: 300px;
  overflow: auto;
}

.tag-row {
  border: 1px solid var(--kd-line);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ops {
  display: flex;
  gap: 8px;
}

.danger {
  color: var(--color-danger);
}
</style>
