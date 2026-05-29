<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useMcp } from '../composables/useMcp.js'

const props = defineProps({
  agentId: { type: String, required: true },
})

const { state, refresh, create, update, remove, install, uninstall } = useMcp(props.agentId)

const busyId = ref('')
const editingId = ref('')
const form = reactive({
  name: '',
  sourceType: 'custom',
  command: '',
  argsText: '',
  httpUrl: '',
  headersText: '',
  envText: '',
  packageName: '',
  version: '',
  gitUrl: '',
  gitRef: '',
})

function resetForm() {
  form.name = ''
  form.sourceType = 'custom'
  form.command = ''
  form.argsText = ''
  form.httpUrl = ''
  form.headersText = ''
  form.envText = ''
  form.packageName = ''
  form.version = ''
  form.gitUrl = ''
  form.gitRef = ''
  editingId.value = ''
}

function parseEnvText(text) {
  const out = {}
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1)
    if (!key) continue
    out[key] = value
  }
  return out
}

function parseHeadersText(text) {
  return parseEnvText(text)
}

function formatEnv(env) {
  if (!env || typeof env !== 'object') return ''
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join('\n')
}

function toPayload() {
  const args = form.argsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    name: form.name.trim(),
    sourceType: form.sourceType,
    command: form.command.trim(),
    args,
    httpUrl: form.httpUrl.trim(),
    headers: parseHeadersText(form.headersText),
    env: form.sourceType === 'http' ? {} : parseEnvText(form.envText),
    packageName: form.packageName.trim(),
    version: form.version.trim(),
    gitUrl: form.gitUrl.trim(),
    gitRef: form.gitRef.trim(),
  }
}

function beginEdit(item) {
  editingId.value = item.id
  form.name = item.name || ''
  form.sourceType = item.sourceType || 'custom'
  form.command = item.command || ''
  form.argsText = Array.isArray(item.args) ? item.args.join('\n') : ''
  form.httpUrl = item.httpUrl || item.url || ''
  form.headersText = formatEnv(item.headers)
  form.envText = formatEnv(item.env)
  form.packageName = item.packageName || ''
  form.version = item.version || ''
  form.gitUrl = item.gitUrl || ''
  form.gitRef = item.gitRef || ''
}

async function submit() {
  try {
    if (editingId.value) {
      await update(editingId.value, toPayload())
    } else {
      await create(toPayload())
    }
    resetForm()
  } catch (err) {
    window.alert(`保存 MCP 失败：${err?.message || err}`)
  }
}

async function handleInstall(item) {
  busyId.value = item.id
  try {
    await install(item.id)
  } catch (err) {
    window.alert(`安装失败：${err?.message || err}`)
  } finally {
    busyId.value = ''
  }
}

async function handleUninstall(item) {
  busyId.value = item.id
  try {
    await uninstall(item.id)
  } catch (err) {
    window.alert(`卸载失败：${err?.message || err}`)
  } finally {
    busyId.value = ''
  }
}

async function handleDelete(item) {
  if (!window.confirm(`确定删除 MCP「${item.name}」吗？`)) return
  try {
    await remove(item.id)
  } catch (err) {
    window.alert(`删除失败：${err?.message || err}`)
  }
}

onMounted(() => {
  refresh()
})
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <h3>MCP 管理与安装</h3>
      <button class="refresh-btn" @click="refresh">刷新</button>
    </header>

    <p v-if="state.error" class="error-line">加载失败：{{ state.error }}</p>

    <div class="form-grid">
      <label>
        名称
        <input v-model="form.name" placeholder="例如：filesystem-mcp" />
      </label>
      <label>
        来源类型
        <select v-model="form.sourceType">
          <option value="custom">custom command</option>
          <option value="npm">npm / npx</option>
          <option value="pip">pip</option>
          <option value="git">git</option>
          <option value="http">http</option>
        </select>
      </label>

      <label v-if="form.sourceType === 'npm' || form.sourceType === 'pip'" class="full">
        packageName
        <input v-model="form.packageName" placeholder="包名，例如 @modelcontextprotocol/server-filesystem" />
      </label>
      <label v-if="form.sourceType === 'npm' || form.sourceType === 'pip'">
        version（可选）
        <input v-model="form.version" placeholder="latest 或 1.2.3" />
      </label>
      <label v-if="form.sourceType === 'git'" class="full">
        Git URL
        <input v-model="form.gitUrl" placeholder="https://github.com/xxx/xxx.git" />
      </label>
      <label v-if="form.sourceType === 'git'">
        Git Ref（可选）
        <input v-model="form.gitRef" placeholder="main / tag / commit" />
      </label>
      <label v-if="form.sourceType === 'http'" class="full">
        HTTP URL
        <input v-model="form.httpUrl" placeholder="https://example.com/mcp" />
      </label>
      <label v-if="form.sourceType === 'http'" class="full">
        headers（每行一个 `KEY=VALUE`）
        <textarea v-model="form.headersText" rows="3" placeholder="Authorization=Bearer xxx&#10;x-api-key=xxxx" />
      </label>
      <label v-if="form.sourceType !== 'http'" class="full">
        args（每行一个）
        <textarea v-model="form.argsText" rows="3" placeholder="-y&#10;@modelcontextprotocol/server-filesystem" />
      </label>
      <label v-if="form.sourceType !== 'http'" class="full">
        command（可选，安装后启动命令）
        <input v-model="form.command" placeholder="例如：npx 或 python" />
      </label>
      <label v-if="form.sourceType !== 'http'" class="full">
        env（每行一个 `KEY=VALUE`，可用于 API_KEY）
        <textarea v-model="form.envText" rows="3" placeholder="API_KEY=xxxx&#10;BASE_URL=https://api.example.com" />
      </label>
    </div>

    <div class="form-actions">
      <button class="primary-btn" @click="submit">{{ editingId ? '更新 MCP' : '新增 MCP' }}</button>
      <button v-if="editingId" class="ghost-btn" @click="resetForm">取消编辑</button>
    </div>

    <div v-if="state.loading" class="empty">加载中...</div>
    <div v-else-if="state.items.length === 0" class="empty">还没有 MCP，先新增一个。</div>

    <ul v-else class="items">
      <li v-for="item in state.items" :key="item.id" class="item">
        <div class="item-main">
          <div class="title">{{ item.name }}</div>
          <div class="meta">
            <span>{{ item.sourceType }}</span>
            <span>状态：{{ item.status }}</span>
            <span v-if="item.command">命令：{{ item.command }}</span>
            <span v-if="item.packageName">包：{{ item.packageName }}</span>
            <span v-if="item.gitUrl">仓库：{{ item.gitUrl }}</span>
            <span v-if="item.httpUrl">HTTP：{{ item.httpUrl }}</span>
            <span v-if="item.headers && Object.keys(item.headers).length">请求头：{{ Object.keys(item.headers).length }} 项</span>
            <span v-if="item.env && Object.keys(item.env).length">环境变量：{{ Object.keys(item.env).length }} 项</span>
          </div>
          <div v-if="item.lastError" class="item-error">最近错误：{{ item.lastError }}</div>
        </div>
        <div class="item-actions">
          <button class="ghost-btn" @click="beginEdit(item)">编辑</button>
          <button
            class="primary-btn"
            :disabled="busyId === item.id"
            @click="handleInstall(item)"
          >
            {{ busyId === item.id ? '处理中...' : '安装' }}
          </button>
          <button
            class="ghost-btn"
            :disabled="busyId === item.id"
            @click="handleUninstall(item)"
          >
            卸载
          </button>
          <button class="danger-btn" @click="handleDelete(item)">删除</button>
        </div>
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

.refresh-btn,
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
textarea,
select {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  background: #fff;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.error-line,
.item-error {
  color: var(--color-danger);
  margin: 0 0 8px;
  font-size: 12px;
}

.empty {
  margin-top: 16px;
  color: var(--color-text-muted);
}

.items {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
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

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
