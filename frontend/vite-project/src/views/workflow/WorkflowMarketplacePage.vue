<script setup>
import { useRouter } from 'vue-router'
import WorkflowMarketplaceBrowse from '../../components/workflow/WorkflowMarketplaceBrowse.vue'

const router = useRouter()

function openDetail(templateId) {
  const id = String(templateId || '').trim()
  if (!id) return
  router.push({ name: 'workflow-marketplace-detail', params: { templateId: id } })
}
</script>

<template>
  <WorkflowMarketplaceBrowse @open-detail="openDetail" />
</template>
