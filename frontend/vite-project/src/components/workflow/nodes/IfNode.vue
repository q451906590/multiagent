<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
})

const title = computed(() => String(props.label || props.data?.label || '条件分支 IF'))
const statusClass = computed(() => {
  const status = String(props.data?.runStatus || '').trim().toLowerCase()
  if (status === 'running') return 'status-running'
  if (status === 'failed') return 'status-failed'
  if (status === 'succeeded') return 'status-succeeded'
  return ''
})
</script>

<template>
  <div class="branch-node if-node" :class="statusClass">
    <Handle type="target" :position="Position.Top" id="if-in" />
    <div class="title">{{ title }}</div>
    <div class="ports">
      <div class="port">True</div>
      <div class="port">False</div>
    </div>
    <Handle type="source" :position="Position.Bottom" id="if-true" :style="{ left: '30%' }" />
    <Handle type="source" :position="Position.Bottom" id="if-false" :style="{ left: '70%' }" />
  </div>
</template>

<style scoped>
.branch-node {
  min-width: 180px;
  min-height: 78px;
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
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #86909c;
}

.port {
  width: 48%;
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
