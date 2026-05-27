<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
})

const title = computed(() => String(props.label || props.data?.label || '分支 Switch'))
const statusClass = computed(() => {
  const status = String(props.data?.runStatus || '').trim().toLowerCase()
  if (status === 'running') return 'status-running'
  if (status === 'failed') return 'status-failed'
  if (status === 'succeeded') return 'status-succeeded'
  return ''
})

const outputCount = computed(() => {
  const n = Number(props.data?.outputCount || 3)
  if (!Number.isFinite(n)) return 3
  return Math.min(6, Math.max(2, Math.floor(n)))
})

const outputLabels = computed(() => {
  const labels = Array.isArray(props.data?.outputLabels) ? props.data.outputLabels : []
  return Array.from({ length: outputCount.value }, (_v, idx) => {
    const raw = String(labels[idx] || '').trim()
    return raw || `分支${idx + 1}`
  })
})
</script>

<template>
  <div class="branch-node switch-node" :class="statusClass">
    <Handle type="target" :position="Position.Top" id="switch-in" />
    <div class="title">{{ title }}</div>
    <div class="ports" :style="{ gridTemplateColumns: `repeat(${outputCount}, minmax(0, 1fr))` }">
      <div v-for="(labelText, idx) in outputLabels" :key="`switch-label-${idx}`" class="port">
        {{ labelText }}
      </div>
    </div>
    <Handle
      v-for="(_labelText, idx) in outputLabels"
      :key="`switch-source-${idx}`"
      type="source"
      :position="Position.Bottom"
      :id="`switch-${idx}`"
      :style="{ left: `${((idx + 1) * 100) / (outputCount + 1)}%` }"
    />
  </div>
</template>

<style scoped>
.branch-node {
  min-width: 220px;
  min-height: 84px;
  border: 1px solid #1f23291f;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px #1f23290f;
  padding: 10px 10px 8px;
}

.title {
  text-align: center;
  font-size: 13px;
  color: #1f2329;
  font-weight: 600;
}

.ports {
  margin-top: 18px;
  display: grid;
  gap: 4px;
  font-size: 11px;
  color: #86909c;
}

.port {
  text-align: center;
}

.branch-node.status-running {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.18);
}

.branch-node.status-failed {
  border-color: #ff4d4f;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.18);
}

.branch-node.status-succeeded {
  border-color: #52c41a;
  box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.18);
}
</style>
