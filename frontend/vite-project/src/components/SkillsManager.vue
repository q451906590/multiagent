<script setup>
import { reactive, onMounted } from 'vue'
import { useSkills } from '../composables/useSkills.js'

const props = defineProps({
  agentId: { type: String, required: true },
})

const { state, refresh, install, remove } = useSkills(props.agentId)

const form = reactive({
  name: '',
  sourceType: 'local',
  source: '',
  ref: '',
})

function resetForm() {
  form.name = ''
  form.sourceType = 'local'
  form.source = ''
  form.ref = ''
}

async function submit() {
  try {
    await install({
      name: form.name.trim(),
      sourceType: form.sourceType,
      source: form.source.trim(),
      ref: form.ref.trim(),
    })
    resetForm()
  } catch (err) {
    window.alert(`安装 Skill 失败：${err?.message || err}`)
  }
}

async function handleDelete(item) {
  if (!window.confirm(`确定删除 Skill「${item.name}」吗？`)) return
  try {
    await remove(item.id)
  } catch (err) {
    window.alert(`删除 Skill 失败：${err?.message || err}`)
  }
}

onMounted(() => {
  refresh()
})
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h3>Skills 管理与安装</h3>
      <button class="ghost-btn" @click="refresh">刷新</button>
    </header>

    <p v-if="state.error" class="error-line">加载失败：{{ state.error }}</p>

    <div class="form-grid">
      <label>
        名称
        <input v-model="form.name" placeholder="例如：my-coding-skill" />
      </label>
      <label>
        来源类型
        <select v-model="form.sourceType">
          <option value="local">本地目录</option>
          <option value="git">Git 仓库</option>
        </select>
      </label>
      <label class="full">
        {{ form.sourceType === 'local' ? '本地路径' : 'Git URL' }}
        <input
          v-model="form.source"
          :placeholder="form.sourceType === 'local' ? '例如：D:/skills/my-skill' : '例如：https://github.com/org/repo.git'"
        />
      </label>
      <label v-if="form.sourceType === 'git'" class="full">
        Git Ref（可选）
        <input v-model="form.ref" placeholder="main / tag / commit" />
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-btn" @click="submit">安装 Skill</button>
    </div>

    <div v-if="state.loading" class="empty">加载中...</div>
    <div v-else-if="state.items.length === 0" class="empty">还没有 Skill，先安装一个。</div>

    <ul v-else class="items">
      <li v-for="item in state.items" :key="item.id" class="item">
        <div class="item-main">
          <div class="title">{{ item.name }}</div>
          <div class="meta">
            <span>{{ item.sourceType }}</span>
            <span>状态：{{ item.status }}</span>
            <span>来源：{{ item.source }}</span>
          </div>
          <div v-if="item.lastError" class="error-line">最近错误：{{ item.lastError }}</div>
        </div>
        <button class="danger-btn" @click="handleDelete(item)">删除</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.panel-head h3 {
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-soft);
}

.form-grid .full {
  grid-column: 1 / -1;
}

input,
select {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  background: #fff;
}

.form-actions {
  margin-top: 10px;
}

.ghost-btn,
.primary-btn,
.danger-btn {
  padding: 7px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.primary-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.danger-btn {
  color: var(--color-danger);
  border-color: #f3c6c6;
}

.error-line {
  color: var(--color-danger);
  font-size: 12px;
}

.empty {
  margin-top: 16px;
  color: var(--color-text-muted);
}

.items {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.title {
  font-weight: 600;
}

.meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
