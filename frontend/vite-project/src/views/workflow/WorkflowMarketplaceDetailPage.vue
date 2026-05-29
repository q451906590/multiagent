<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import WorkflowMarketplaceDetail from '../../components/workflow/WorkflowMarketplaceDetail.vue'

const route = useRoute()
const templateId = computed(() => String(route.params.templateId || '').trim())
</script>

<template>
  <WorkflowMarketplaceDetail :template-id="templateId" />
</template>
