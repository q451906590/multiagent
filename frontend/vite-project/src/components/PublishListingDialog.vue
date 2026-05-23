<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  agent: { type: Object, default: null },
})

const emit = defineEmits(['cancel', 'submit'])

const form = reactive({
  title: '',
  description: '',
})

watch(
  () => props.open,
  (value) => {
    if (!value) return
    form.title = props.agent?.name || ''
    form.description = ''
  },
  { immediate: true }
)

function onSubmit() {
  if (!props.agent?.id) return
  emit('submit', {
    agentId: props.agent.id,
    title: form.title.trim(),
    description: form.description.trim(),
  })
}
</script>

<template>
  <div v-if="open" class="mask" @click.self="emit('cancel')">
    <div class="dialog">
      <h3>发布到 Agent 市集</h3>
      <p class="hint">将复制当前 Agent 的 skills / MCP / Hermes 配置模板，公开给其他用户接入。</p>
      <label class="field">
        <span>展示标题</span>
        <input v-model="form.title" placeholder="例如：全栈研发助手" />
      </label>
      <label class="field">
        <span>简介</span>
        <textarea v-model="form.description" rows="5" placeholder="简要说明这个 Agent 擅长什么" />
      </label>
      <div class="footer">
        <button class="btn ghost" @click="emit('cancel')">取消</button>
        <button class="btn primary" @click="onSubmit">确认发布</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: rgba(20, 24, 40, 0.45);
}

.dialog {
  width: min(560px, calc(100vw - 32px));
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

h3 {
  margin: 0;
  font-size: 18px;
}

.hint {
  margin: 8px 0 14px;
  font-size: 13px;
  color: var(--color-text-soft);
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.field span {
  font-size: 12px;
  color: var(--color-text-soft);
}

.field input,
.field textarea {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: #fff;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 8px 14px;
}

.btn.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.btn.ghost {
  background: var(--color-surface);
}
</style>
