<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'

const username = ref('')
const password = ref('')
const mode = ref('login')
const localError = ref('')
const { state, login, register } = useAuth()

async function onSubmit() {
  localError.value = ''
  const payload = {
    username: username.value.trim(),
    password: password.value,
  }
  if (!payload.username || !payload.password) {
    localError.value = '请输入用户名和密码'
    return
  }
  try {
    if (mode.value === 'register') {
      await register(payload)
    } else {
      await login(payload)
    }
  } catch (err) {
    localError.value = err?.message || String(err)
  }
}
</script>

<template>
  <section class="login-shell">
    <form class="login-card" @submit.prevent="onSubmit">
      <h2>登录 Multi-Agent Workspace</h2>
      <p>首次使用请切换到注册模式创建账号。</p>
      <label>
        用户名
        <input v-model="username" autocomplete="username" placeholder="请输入用户名" />
      </label>
      <label>
        密码
        <input v-model="password" autocomplete="current-password" type="password" placeholder="请输入密码" />
      </label>
      <div class="mode-row">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'login' }"
          @click="mode = 'login'"
        >
          登录
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
        >
          注册
        </button>
      </div>
      <div v-if="localError || state.error" class="error">{{ localError || state.error }}</div>
      <button class="submit-btn" :disabled="state.loading">
        {{ state.loading ? '提交中…' : mode === 'register' ? '注册并登录' : '登录' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.login-shell { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.login-card { width: min(420px, 92vw); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; box-shadow: var(--shadow-md); padding: 20px; display: grid; gap: 10px; }
h2 { margin: 0; font-size: 20px; }
p { margin: 0; color: var(--color-text-muted); font-size: 13px; }
label { display: grid; gap: 6px; color: var(--color-text-soft); font-size: 13px; }
input { border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 10px; background: var(--color-bg); }
.mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.mode-btn { border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 10px; background: var(--color-bg); color: var(--color-text); }
.mode-btn.active { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
.submit-btn { border-radius: 8px; padding: 10px 12px; background: var(--color-primary); color: #fff; margin-top: 2px; }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: var(--color-danger); font-size: 13px; min-height: 18px; }
</style>
