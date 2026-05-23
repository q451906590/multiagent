import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendHost = (
    process.env.VITE_BACKEND_HOST ||
    env.VITE_BACKEND_HOST ||
    'localhost'
  ).trim() || 'localhost'
  const backendPort = Number(
    process.env.VITE_BACKEND_PORT ||
    env.VITE_BACKEND_PORT ||
    8080
  ) || 8080

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
