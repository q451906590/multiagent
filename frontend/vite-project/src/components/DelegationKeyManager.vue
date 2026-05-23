<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  createDelegationKey,
  deleteDelegationKey,
  listDelegationKeys,
  revokeDelegationKey,
} from '../api/delegations.js'

const props = defineProps({
  agent: { type: Object, required: true },
})

const emit = defineEmits(['back'])

const loading = ref(false)
const error = ref('')
const keys = ref([])
const note = ref('')
const ttlDays = ref(30)
const creating = ref(false)
const latestPlainAk = ref('')

const title = computed(() => `${props.agent.emoji || '🤖'} ${props.agent.name}`)

function formatTs(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return new Date(n).toLocaleString()
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const list = await listDelegationKeys(props.agent.id)
    keys.value = Array.isArray(list) ? list : []
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  creating.value = true
  error.value = ''
  latestPlainAk.value = ''
  try {
    const ttl = Number(ttlDays.value)
    const created = await createDelegationKey(props.agent.id, {
      note: note.value.trim(),
      ttlMs: Math.max(1, Math.floor(ttl * 24 * 60 * 60 * 1000)),
    })
    latestPlainAk.value = String(created?.key || '')
    note.value = ''
    await refresh()
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    creating.value = false
  }
}

async function onRevoke(keyId) {
  try {
    await revokeDelegationKey(props.agent.id, keyId)
    await refresh()
  } catch (err) {
    error.value = err?.message || String(err)
  }
}

async function onDelete(keyId) {
  if (!window.confirm('确认删除该 AK？删除后无法恢复。')) return
  try {
    await deleteDelegationKey(props.agent.id, keyId)
    await refresh()
  } catch (err) {
    error.value = err?.message || String(err)
  }
}

async function copyLatest() {
  if (!latestPlainAk.value) return
  await navigator.clipboard.writeText(latestPlainAk.value)
  window.alert('已复制 AK')
}

async function copyAgentId() {
  const agentId = String(props.agent?.id || '').trim()
  if (!agentId) return
  await navigator.clipboard.writeText(agentId)
  window.alert('已复制 Agent ID')
}

onMounted(refresh)
</script>

<template>
  <section class="page">
    <header class="topbar">
      <button class="ghost-btn" @click="emit('back')">返回</button>
      <div class="title-wrap">
        <h2>外派 AK 管理</h2>
        <p>{{ title }}</p>
      </div>
      <button class="ghost-btn" :disabled="loading" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <section class="panel">
      <h3>接入标识</h3>
      <p class="hint">将下面的 Agent ID 提供给接入方，与 AK 搭配使用。</p>
      <div class="ak-box">
        <div class="ak-value">{{ props.agent.id }}</div>
        <button class="ghost-btn" @click="copyAgentId">复制 Agent ID</button>
      </div>
    </section>

    <section class="panel">
      <h3>创建新 AK</h3>
      <div class="form-row">
        <input v-model="note" placeholder="备注（可选）" />
        <input v-model.number="ttlDays" type="number" min="1" max="3650" />
        <button class="primary-btn" :disabled="creating" @click="onCreate">{{ creating ? '创建中…' : '创建 AK' }}</button>
      </div>
      <p class="hint">默认单位为天，创建后仅展示一次明文。</p>
      <div v-if="latestPlainAk" class="ak-box">
        <div class="ak-value">{{ latestPlainAk }}</div>
        <button class="ghost-btn" @click="copyLatest">复制</button>
      </div>
    </section>

    <section class="panel">
      <h3>AK 列表</h3>
      <div v-if="error" class="error">{{ error }}</div>
      <table class="tbl">
        <thead>
          <tr>
            <th>前缀</th>
            <th>备注</th>
            <th>调用方</th>
            <th>调用次数</th>
            <th>过期时间</th>
            <th>最近使用</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in keys" :key="item.id">
            <td><code>{{ item.keyPrefix }}</code></td>
            <td>{{ item.note || '-' }}</td>
            <td><code>{{ item.lastCallerId || 'unknown' }}</code></td>
            <td>{{ Number(item.useCount || 0) }}</td>
            <td>{{ formatTs(item.expiresAt) }}</td>
            <td>{{ formatTs(item.lastUsedAt) }}</td>
            <td>{{ item.revokedAt ? '已撤销' : '生效中' }}</td>
            <td class="ops">
              <button class="ghost-btn" :disabled="!!item.revokedAt" @click="onRevoke(item.id)">撤销</button>
              <button class="danger-btn" @click="onDelete(item.id)">删除</button>
            </td>
          </tr>
          <tr v-if="!loading && keys.length === 0">
            <td colspan="8" class="empty">暂无 AK</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.page { padding: 24px 40px 48px; max-width: 1280px; margin: 0 auto; width: 100%; }
.topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.title-wrap h2 { margin: 0; font-size: 20px; }
.title-wrap p { margin: 2px 0 0; color: var(--color-text-muted); font-size: 13px; }
.panel { border: 1px solid var(--color-border); border-radius: 12px; padding: 14px; background: var(--color-surface); margin-bottom: 14px; }
.form-row { display: flex; gap: 8px; align-items: center; }
input { border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 10px; background: var(--color-bg); color: var(--color-text); }
.hint { font-size: 12px; color: var(--color-text-muted); }
.ak-box { margin-top: 8px; border: 1px dashed var(--color-border-strong); border-radius: 10px; padding: 10px; display: flex; gap: 10px; align-items: center; }
.ak-value { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-top: 1px solid var(--color-border); padding: 8px; text-align: left; vertical-align: middle; }
.ops { display: flex; gap: 6px; }
.empty { text-align: center; color: var(--color-text-muted); }
.primary-btn { border-radius: 8px; padding: 8px 12px; background: var(--color-primary); color: #fff; }
.ghost-btn { border-radius: 8px; padding: 7px 10px; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); }
.danger-btn { border-radius: 8px; padding: 7px 10px; background: var(--color-danger-soft); border: 1px solid var(--color-danger); color: var(--color-danger); }
.error { color: var(--color-danger); margin-bottom: 8px; }
</style>
