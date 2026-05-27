<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarketplaceListingDetail from '../components/MarketplaceListingDetail.vue'

const route = useRoute()
const templateId = computed(() => String(route.params.templateId || '').trim())
</script>

<template>
  <MarketplaceListingDetail :template-id="templateId" />
</template>
