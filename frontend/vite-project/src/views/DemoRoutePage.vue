<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DemoPage from '../components/DemoPage.vue'

const route = useRoute()

const title = computed(() => {
  const key = String(route.params.menuKey || '').trim()
  const labelMap = {
    assetCenter: '创作后台',
    pointMall: '积分商城',
    safety: '审核与安全',
    analytics: '数据洞察',
  }
  return `${labelMap[key] || key || '功能'}（Demo）`
})

const description = computed(() => '该菜单已按截图完成占位展示，当前版本先提供独立 Demo 页。')
</script>

<template>
  <DemoPage :title="title" :description="description" />
</template>
