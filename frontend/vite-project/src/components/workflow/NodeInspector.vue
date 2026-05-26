<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  node: { type: Object, default: null },
})

const emit = defineEmits(['update-node', 'delete-node'])

const form = reactive({
  label: '',
  prompt: '',
  timeoutMs: 0,
})

const isAgentNode = computed(() => String(props.node?.type || '') === 'agent')

watch(
  () => props.node,
  (next) => {
    form.label = String(next?.label || next?.data?.label || '')
    form.prompt = String(next?.data?.prompt || '')
    form.timeoutMs = Number(next?.data?.timeoutMs || 0)
  },
  { immediate: true }
)

function applyChanges() {
  if (!props.node) return
  emit('update-node', {
    ...props.node,
    label: form.label,
    data: {
      ...(props.node?.data || {}),
      prompt: form.prompt,
      timeoutMs: Number(form.timeoutMs || 0),
      label: form.label,
    },
  })
}

function removeNode() {
  if (!props.node) return
  emit('delete-node', props.node.id)
}
</script>

<template>
  <aside class="inspector">
    <h3>属性</h3>
    <div v-if="!node" class="empty">请选择一个节点</div>
    <template v-else>
      <label class="field">
        <span>节点标题</span>
        <input v-model="form.label" type="text" placeholder="请输入标题" />
      </label>
      <label v-if="isAgentNode" class="field">
        <span>Agent Prompt</span>
        <textarea
          v-model="form.prompt"
          rows="6"
          placeholder="该节点执行时发送给 Agent 的指令"
        />
      </label>
      <label v-if="isAgentNode" class="field">
        <span>超时（毫秒）</span>
        <input v-model.number="form.timeoutMs" type="number" min="0" step="1000" />
      </label>
      <div class="actions">
        <button class="btn primary" @click="applyChanges">应用修改</button>
        <button class="btn danger" @click="removeNode">删除节点</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  width: 300px;
  flex: 0 0 300px;
  background: var(--kd-surface);
  border: 1px solid var(--kd-line);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
  align-content: start;
}

h3 {
  margin: 0;
  font-size: 14px;
}

.empty {
  color: var(--kd-text-muted);
  font-size: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--kd-text-soft);
}

input,
textarea {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  height: 30px;
  border-radius: 8px;
  padding: 0 10px;
  border: 1px solid var(--kd-line);
}

.btn.primary {
  border-color: var(--kd-primary);
  color: var(--kd-primary);
}

.btn.danger {
  border-color: #f2c5c7;
  color: #be2d33;
}
</style>
