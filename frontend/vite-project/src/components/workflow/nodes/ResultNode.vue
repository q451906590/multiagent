<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { toAuthedUrl } from '../../../api/http.js'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
})

const title = computed(() => String(props.label || props.data?.label || '结果输出'))
const archive = computed(() =>
  props.data?.resultArchive && typeof props.data.resultArchive === 'object'
    ? props.data.resultArchive
    : null
)
const downloadPath = computed(() => String(archive.value?.downloadPath || '').trim())
const authedDownloadPath = computed(() => (downloadPath.value ? toAuthedUrl(downloadPath.value) : ''))
const archiveName = computed(() => String(archive.value?.archiveName || 'workflow-result.zip').trim() || 'workflow-result.zip')
const statusClass = computed(() => {
  const status = String(props.data?.runStatus || '').trim().toLowerCase()
  if (status === 'running') return 'status-running'
  if (status === 'failed') return 'status-failed'
  if (status === 'succeeded') return 'status-succeeded'
  return ''
})
const canDownload = computed(() => statusClass.value === 'status-succeeded' && Boolean(downloadPath.value))
</script>

<template>
  <div class="result-node" :class="statusClass">
    <Handle type="target" :position="Position.Top" id="result-in" />
    <div class="title">{{ title }}</div>
    <div class="sub">打包并提供下载</div>
    <a
      v-if="canDownload"
      class="download-link"
      :href="authedDownloadPath"
      target="_blank"
      rel="noopener noreferrer"
      @click.stop
    >
      下载 {{ archiveName }}
    </a>
  </div>
</template>

<style scoped>
.result-node {
  min-width: 170px;
  min-height: 72px;
  border: 1px solid #1f23291f;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px #1f23290f;
  padding: 10px;
}

.title {
  text-align: center;
  font-size: 13px;
  color: #1f2329;
  font-weight: 600;
}

.sub {
  text-align: center;
  margin-top: 10px;
  font-size: 11px;
  color: #86909c;
}

.download-link {
  display: block;
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  color: #1677ff;
  text-decoration: none;
}

.download-link:hover {
  text-decoration: underline;
}

.result-node.status-running {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.18);
}

.result-node.status-failed {
  border-color: #ff4d4f;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.18);
}

.result-node.status-succeeded {
  border-color: #52c41a;
  box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.18);
}
</style>
