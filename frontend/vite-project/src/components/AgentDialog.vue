<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, nextTick, computed } from 'vue'
import { getAgentHermesConfig, getAgentHermesEnv } from '../api/agents.js'

const props = defineProps({
  mode: { type: String, default: 'create' },
  initialValue: { type: Object, default: null },
})

const emit = defineEmits(['cancel', 'submit'])

const MODELS = [
  { value: 'MiniMax-M2.7', label: 'MiniMax-M2.7（minimax-cn，默认）' },
  { value: 'MiniMax-M2', label: 'MiniMax-M2（minimax-cn）' },
  { value: 'MiniMax-Text-01', label: 'MiniMax-Text-01（minimax-cn）' },
  { value: 'abab6.5s-chat', label: 'abab6.5s-chat（minimax-cn）' },
  { value: 'qwen3.6-plus', label: 'qwen3.6-plus（dashscope / 通义）' },
  { value: 'qwen-max', label: 'qwen-max（dashscope / 通义）' },
  { value: 'qwen-plus', label: 'qwen-plus（dashscope / 通义）' },
  { value: 'qwen-turbo', label: 'qwen-turbo（dashscope / 通义）' },
  { value: 'qwen-coder-plus', label: 'qwen-coder-plus（dashscope / 通义）' },
  { value: 'mimo-v2.5-pro', label: 'mimo-v2.5-pro（xiaomi）' },
]

const EMOJI_PRESETS = ['🧑‍💻', '🧑‍🎨', '🧑‍🔬', '🧑‍💼', '🧑‍🏫', '🦸', '🤖', '🧠', '✨', '🛠️']

const isEdit = computed(() => props.mode === 'edit')
const titleText = computed(() => (isEdit.value ? '编辑 Agent' : '添加 Agent'))
const submitText = computed(() => (isEdit.value ? '保存' : '添加'))

const form = reactive({
  name: props.initialValue?.name ?? '',
  emoji: props.initialValue?.emoji ?? '🤖',
  role: props.initialValue?.role ?? '',
  systemPrompt: props.initialValue?.systemPrompt ?? '',
  agentsMd: props.initialValue?.agentsMdResolved ?? props.initialValue?.agentsMd ?? '',
  model: props.initialValue?.model ?? 'MiniMax-M2.7',
  hostMountPath: props.initialValue?.hostMountPath ?? '',
  hermesConfigYaml: '',
  hermesEnvFile: '',
})

const errors = reactive({
  name: '',
  systemPrompt: '',
})

const submitting = ref(false)
const loadingHermesConfig = ref(false)
const hermesConfigError = ref('')
const loadingHermesEnv = ref(false)
const hermesEnvError = ref('')
const nameInput = ref(null)
const initialHermesConfigYaml = ref('')
const initialHermesEnvFile = ref('')

function validate() {
  errors.name = form.name.trim() ? '' : '请输入 agent 名称'
  errors.systemPrompt = form.systemPrompt.trim() ? '' : '请填写 system prompt'
  return !errors.name && !errors.systemPrompt
}

async function onSubmit() {
  if (!validate()) return
  submitting.value = true
  try {
    emit('submit', {
      ...form,
      hermesConfigEdited: isEdit.value && form.hermesConfigYaml !== initialHermesConfigYaml.value,
      hermesEnvEdited: isEdit.value && form.hermesEnvFile !== initialHermesEnvFile.value,
    })
  } finally {
    submitting.value = false
  }
}

function onCancel() {
  emit('cancel')
}

function pickEmoji(e) {
  form.emoji = e
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onCancel()
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  if (isEdit.value && props.initialValue?.id) {
    loadingHermesConfig.value = true
    loadingHermesEnv.value = true
    hermesConfigError.value = ''
    hermesEnvError.value = ''
    const [configResp, envResp] = await Promise.allSettled([
      getAgentHermesConfig(props.initialValue.id),
      getAgentHermesEnv(props.initialValue.id),
    ])
    if (configResp.status === 'fulfilled') {
      form.hermesConfigYaml = typeof configResp.value?.content === 'string' ? configResp.value.content : ''
    } else {
      hermesConfigError.value = configResp.reason?.message || String(configResp.reason)
    }
    if (envResp.status === 'fulfilled') {
      form.hermesEnvFile = typeof envResp.value?.content === 'string' ? envResp.value.content : ''
    } else {
      hermesEnvError.value = envResp.reason?.message || String(envResp.reason)
    }
    initialHermesConfigYaml.value = form.hermesConfigYaml
    initialHermesEnvFile.value = form.hermesEnvFile
    loadingHermesConfig.value = false
    loadingHermesEnv.value = false
  }
  await nextTick()
  nameInput.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="overlay" @click.self="onCancel">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <header class="dialog-head">
        <h2 id="dialog-title">{{ titleText }}</h2>
        <button class="close-btn" aria-label="关闭" @click="onCancel">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </header>

      <form class="dialog-body" @submit.prevent="onSubmit">
        <div class="field">
          <label for="agent-name">名称<span class="req">*</span></label>
          <input
            id="agent-name"
            ref="nameInput"
            v-model="form.name"
            type="text"
            placeholder="例如：前端工程师"
            maxlength="40"
            :class="{ 'has-error': errors.name }"
            @input="errors.name = ''"
          />
          <div v-if="errors.name" class="err-text">{{ errors.name }}</div>
        </div>

        <div class="field">
          <label>头像 Emoji</label>
          <div class="emoji-row">
            <input
              v-model="form.emoji"
              type="text"
              class="emoji-input"
              maxlength="4"
            />
            <div class="emoji-presets">
              <button
                v-for="e in EMOJI_PRESETS"
                :key="e"
                type="button"
                class="emoji-chip"
                :class="{ active: form.emoji === e }"
                @click="pickEmoji(e)"
              >
                {{ e }}
              </button>
            </div>
          </div>
        </div>

        <div class="field">
          <label for="agent-role">角色描述</label>
          <input
            id="agent-role"
            v-model="form.role"
            type="text"
            placeholder="一句话简介，例如：负责 React/Vue 前端开发"
            maxlength="80"
          />
        </div>

        <div class="field">
          <label for="agent-prompt">System Prompt<span class="req">*</span></label>
          <textarea
            id="agent-prompt"
            v-model="form.systemPrompt"
            rows="6"
            placeholder="例如：你是一名资深前端工程师，擅长 Vue 与 React，回答时注重最佳实践与可维护性……"
            :class="{ 'has-error': errors.systemPrompt }"
            @input="errors.systemPrompt = ''"
          ></textarea>
          <div v-if="errors.systemPrompt" class="err-text">{{ errors.systemPrompt }}</div>
        </div>

        <div class="field">
          <label for="agent-model">模型</label>
          <select id="agent-model" v-model="form.model">
            <option v-for="m in MODELS" :key="m.value" :value="m.value">
              {{ m.label }}
            </option>
          </select>
        </div>

        <div v-if="!isEdit" class="field">
          <label for="agent-host-mount-path">宿主机持久目录（可选）</label>
          <input
            id="agent-host-mount-path"
            v-model="form.hostMountPath"
            type="text"
            placeholder="例如：D:\\agent-data\\frontend-assistant"
          />
          <div class="help-text">
            填写后将作为 Docker bind mount 挂载到容器内 `/opt/data/host-mount` 子目录，不会覆盖 `/opt/data` 根目录；留空则仅使用默认 named volume。
          </div>
        </div>

        <div v-if="isEdit" class="field">
          <label for="agent-agents-md">AGENTS.md（可选）</label>
          <textarea
            id="agent-agents-md"
            v-model="form.agentsMd"
            rows="10"
            placeholder="留空时将根据名称/角色/System Prompt 自动生成 AGENTS.md。"
          ></textarea>
          <div class="help-text">填写后将直接覆盖容器中的 `/opt/data/AGENTS.md`。</div>
        </div>

        <div v-if="isEdit" class="field">
          <label for="agent-hermes-config">~/.hermes/config.yaml</label>
          <textarea
            id="agent-hermes-config"
            v-model="form.hermesConfigYaml"
            rows="12"
            placeholder="可直接编辑每个 Agent 的 Hermes 配置文件。"
            :disabled="loadingHermesConfig"
          ></textarea>
          <div v-if="loadingHermesConfig" class="help-text">正在加载配置...</div>
          <div v-else-if="hermesConfigError" class="err-text">加载失败：{{ hermesConfigError }}</div>
          <div v-else class="help-text">保存时将写入容器中的 `~/.hermes/config.yaml`。</div>
        </div>

        <div v-if="isEdit" class="field">
          <label for="agent-hermes-env">~/.hermes/.env</label>
          <textarea
            id="agent-hermes-env"
            v-model="form.hermesEnvFile"
            rows="10"
            placeholder="可直接编辑每个 Agent 的 Hermes 环境变量文件。"
            :disabled="loadingHermesEnv"
          ></textarea>
          <div v-if="loadingHermesEnv" class="help-text">正在加载环境变量...</div>
          <div v-else-if="hermesEnvError" class="err-text">加载失败：{{ hermesEnvError }}</div>
          <div v-else class="help-text">保存时将写入容器中的 `~/.hermes/.env`。</div>
        </div>

        <footer class="dialog-foot">
          <button type="button" class="btn btn-ghost" @click="onCancel">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="submitting || loadingHermesConfig || loadingHermesEnv">
            {{ submitText }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 40, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.dialog {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 48px);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.close-btn:hover {
  background: var(--color-surface-soft);
  color: var(--color-text);
}

.dialog-body {
  padding: 18px 20px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.req {
  color: var(--color-danger);
  margin-left: 2px;
}

.field input[type='text'],
.field textarea,
.field select {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field input[type='text']:focus,
.field textarea:focus,
.field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(91, 108, 255, 0.16);
}

.field textarea {
  font-family: inherit;
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
}

.has-error {
  border-color: var(--color-danger) !important;
}

.err-text {
  font-size: 12px;
  color: var(--color-danger);
}

.help-text {
  font-size: 12px;
  color: var(--color-text-muted);
}

.emoji-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.emoji-input {
  width: 72px;
  text-align: center;
  font-size: 20px;
  padding: 6px 8px !important;
}

.emoji-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.emoji-chip {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.emoji-chip:hover {
  border-color: var(--color-primary);
}

.emoji-chip.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  padding: 9px 18px;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 14px;
  border: 1px solid transparent;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.btn-ghost {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

.btn-ghost:hover {
  background: var(--color-surface-soft);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
