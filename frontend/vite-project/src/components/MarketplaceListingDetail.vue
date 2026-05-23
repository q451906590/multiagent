<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMarketplace } from '../composables/useMarketplace.js'
import { useAgents } from '../composables/useAgents.js'

const props = defineProps({
  templateId: { type: String, required: true },
})

const emit = defineEmits(['back'])
const { state, loadDetail, installAgent } = useMarketplace()
const { ensureLoaded } = useAgents()
const loading = ref(false)
const error = ref('')
const installing = ref(false)
const installMsg = ref('')

const detail = computed(() => state.detailById[props.templateId] || null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    await loadDetail(props.templateId, { force: true })
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

watch(() => props.templateId, load, { immediate: true })
onMounted(load)

async function onInstall() {
  installing.value = true
  installMsg.value = ''
  error.value = ''
  try {
    const result = await installAgent(props.templateId)
    await ensureLoaded()
    if (Array.isArray(result?.hermesMissingKeys) && result.hermesMissingKeys.length > 0) {
      installMsg.value = `接入完成，需补充密钥：${result.hermesMissingKeys.join(', ')}`
    } else {
      installMsg.value = '接入完成，可在工作区里直接使用。'
    }
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <section class="detail">
    <header class="head">
      <button class="back-btn" @click="emit('back')">返回市集</button>
      <h2>Agent 详情</h2>
    </header>

    <p v-if="loading" class="tip">加载中…</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <article v-else-if="detail" class="panel">
      <div class="title">
        <span class="emoji">{{ detail.emoji || '🤖' }}</span>
        <div>
          <h3>{{ detail.title }}</h3>
          <p>作者：{{ detail.publisherUsername || '匿名' }} · 接入 {{ detail.installCount || 0 }}</p>
        </div>
      </div>
      <p class="desc">{{ detail.description || '暂无简介' }}</p>
      <p class="meta">模型：{{ detail.model || '-' }}</p>

      <div class="group">
        <h4>MCP 配置</h4>
        <p>{{ (detail.mcpList || []).length }} 项</p>
      </div>
      <div class="group">
        <h4>Skills 配置</h4>
        <p>{{ (detail.skillsList || []).length }} 项</p>
      </div>
      <div class="group">
        <h4>Hermes 待补全密钥</h4>
        <p>{{ (detail.hermesMissingKeys || []).join(', ') || '无' }}</p>
      </div>

      <button class="install-btn" :disabled="installing" @click="onInstall">
        {{ installing ? '接入中…' : '接入到我的工作区' }}
      </button>
      <p v-if="installMsg" class="ok">{{ installMsg }}</p>
    </article>
  </section>
</template>

<style scoped>
.detail {
  padding: 28px 40px 48px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn,
.install-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--color-surface);
}

.panel {
  margin-top: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: 18px;
  display: grid;
  gap: 10px;
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.emoji {
  font-size: 28px;
}

h3 {
  margin: 0;
}

.title p,
.desc,
.meta {
  margin: 0;
  color: var(--color-text-soft);
}

.group {
  border-top: 1px solid var(--color-border);
  padding-top: 10px;
}

.group h4 {
  margin: 0 0 4px;
  font-size: 13px;
}

.group p {
  margin: 0;
  color: var(--color-text-soft);
  font-size: 13px;
}

.install-btn {
  width: fit-content;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.tip {
  color: var(--color-text-soft);
}

.err {
  color: var(--color-danger);
}

.ok {
  color: #1a7f37;
  font-size: 13px;
  margin: 0;
}
</style>
