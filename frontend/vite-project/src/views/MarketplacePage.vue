<script setup>
import { useRouter } from 'vue-router'
import MarketplaceBrowse from '../components/MarketplaceBrowse.vue'

const router = useRouter()

function openDetail(templateId) {
  const id = String(templateId || '').trim()
  if (!id) return
  router.push({ name: 'marketplace-detail', params: { templateId: id } })
}
</script>

<template>
  <MarketplaceBrowse @open-detail="openDetail" />
</template>
