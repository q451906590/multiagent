<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
})

const title = computed(() => String(props.label || props.data?.label || '用户输入开始'))
</script>

<template>
  <div class="start-node">
    <div class="title">{{ title }}</div>
    <div class="sub">接收文本和上传文件</div>
    <Handle type="source" :position="Position.Bottom" id="start-out" />
  </div>
</template>

<style scoped>
.start-node {
  min-width: 190px;
  min-height: 74px;
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
</style>
