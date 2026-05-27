import { createApp } from 'vue'
import './style.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import App from './App.vue'
import router from './router/index.js'

createApp(App)
  .use(router)
  .mount('#app')
