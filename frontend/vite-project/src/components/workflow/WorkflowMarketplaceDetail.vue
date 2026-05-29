<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowMarketplace } from '../../composables/useWorkflowMarketplace.js'
import { useWorkflow } from '../../composables/useWorkflow.js'

const props = defineProps({
  templateId: { type: String, required: true },
})

const router = useRouter()
const { state, loadDetail, installWorkflow } = useWorkflowMarketplace()
const { ensureLoaded } = useWorkflow()
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
    const result = await installWorkflow(props.templateId)
    await ensureLoaded()
    const installedCount = Array.isArray(result?.installedAgents) ? result.installedAgents.length : 0
    const missingCount = Array.isArray(result?.missingAgents) ? result.missingAgents.length : 0
    installMsg.value = `安装完成，自动安装 Agent ${installedCount} 个${missingCount ? `，缺失 ${missingCount} 个` : ''}`
    if (result?.workflowId) {
      router.push({ name: 'workflow-detail', params: { workflowId: result.workflowId } })
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
      <h2>工作流模板详情</h2>
    </header>

    <p v-if="loading" class="tip">加载中…</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <article v-else-if="detail" class="panel">
      <div class="title">
        <div>
          <h3>{{ detail.title }}</h3>
          <p>作者：{{ detail.publisherUsername || '匿名' }} · 安装 {{ detail.installCount || 0 }}</p>
        </div>
      </div>
      <p class="desc">{{ detail.description || '暂无简介' }}</p>
      <div class="tag-row">
        <span v-for="tag in detail.tags || []" :key="tag.id" class="tag">{{ tag.name }}</span>
      </div>
      <p class="meta">节点 {{ detail.nodeCount || 0 }} · 连线 {{ detail.edgeCount || 0 }} · 依赖 Agent {{ detail.dependencyCount || 0 }}</p>
      <div class="group">
        <h4>模板说明</h4>
        <p>该模板已脱敏，仅包含工作流拓扑与节点基础信息，不包含接收物与交付物配置。</p>
      </div>
      <button class="install-btn" :disabled="installing" @click="onInstall">
        {{ installing ? '安装中…' : '安装到我的工作区' }}
      </button>
      <p v-if="installMsg" class="ok">{{ installMsg }}</p>
    </article>
  </section>
</template>

<style scoped>
.detail { padding: 28px 40px 48px; max-width: 900px; margin: 0 auto; width: 100%; }
.head { display: flex; align-items: center; gap: 12px; }
.panel {
  margin-top: 16px;
  border: 1px solid var(--kd-line);
  border-radius: var(--radius-lg);
  background: var(--kd-surface);
  padding: 18px;
  display: grid;
  gap: 10px;
}
.title { display: flex; align-items: center; gap: 10px; }
h3 { margin: 0; }
.title p,.desc,.meta { margin: 0; color: var(--kd-text-soft); }
.tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  border-radius: 999px;
  border: 1px solid var(--kd-line);
  background: var(--kd-hover);
  color: var(--kd-text-soft);
  font-size: 12px;
  padding: 2px 8px;
}
.group { border-top: 1px solid var(--kd-line); padding-top: 10px; }
.group h4 { margin: 0 0 4px; font-size: 13px; }
.group p { margin: 0; color: var(--kd-text-soft); font-size: 13px; }
.install-btn {
  width: fit-content;
  border: 1px solid var(--kd-primary);
  color: var(--kd-primary);
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--kd-surface);
}
.tip { color: var(--kd-text-soft); }
.err { color: var(--color-danger); }
.ok { color: #1a7f37; font-size: 13px; margin: 0; }
</style>
