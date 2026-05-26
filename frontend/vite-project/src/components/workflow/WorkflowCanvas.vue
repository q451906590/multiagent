<script setup>
import { computed } from 'vue'
import { VueFlow, addEdge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
})

const emit = defineEmits(['update:nodes', 'update:edges', 'node-selected'])

const internalNodes = computed({
  get: () => props.nodes,
  set: (value) => emit('update:nodes', value),
})

const internalEdges = computed({
  get: () => props.edges,
  set: (value) => emit('update:edges', value),
})

function handleConnect(params) {
  const nextEdges = addEdge(
    {
      ...params,
      id: `${params.source || ''}-${params.target || ''}-${Date.now()}`,
      label: '',
    },
    internalEdges.value
  )
  emit('update:edges', nextEdges)
}

function handleNodeClick({ node }) {
  emit('node-selected', node || null)
}
</script>

<template>
  <div class="workflow-canvas">
    <VueFlow
      v-model:nodes="internalNodes"
      v-model:edges="internalEdges"
      class="canvas-flow"
      :fit-view-on-init="true"
      :snap-to-grid="true"
      :default-viewport="{ zoom: 1 }"
      @connect="handleConnect"
      @node-click="handleNodeClick"
    >
      <Background :gap="16" :size="1" />
      <MiniMap />
      <Controls />
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-canvas {
  flex: 1;
  min-width: 0;
  min-height: 620px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  background: #fcfcfd;
}

.canvas-flow {
  width: 100%;
  height: 100%;
}
</style>
