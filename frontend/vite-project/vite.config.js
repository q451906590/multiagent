import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (
    process.env.VITE_API_TARGET ||
    env.VITE_API_TARGET ||
    'http://localhost:8080'
  ).trim() || 'http://localhost:8080'

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
