<script setup>
import { computed, markRaw } from 'vue'
import { VueFlow, addEdge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import IfNode from './nodes/IfNode.vue'
import SwitchNode from './nodes/SwitchNode.vue'
import ResultNode from './nodes/ResultNode.vue'
import StartInputNode from './nodes/StartInputNode.vue'

const props = defineProps({
  nodes: { type: Array, required: true },
  edges: { type: Array, required: true },
})

const emit = defineEmits([
  'update:nodes',
  'update:edges',
  'node-selected',
  'node-position-change',
  'nodePositionChange',
  'nodes-removed',
  'edges-removed',
])

const internalNodes = computed({
  get: () => props.nodes,
  set: (value) => emit('update:nodes', value),
})

const internalEdges = computed({
  get: () => props.edges,
  set: (value) => emit('update:edges', value),
})

const nodeTypes = {
  if: markRaw(IfNode),
  switch: markRaw(SwitchNode),
  result: markRaw(ResultNode),
  'start.userInput': markRaw(StartInputNode),
}

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

function handleNodeDragStop(eventOrPayload, maybeNode, maybeNodes) {
  const payloadNode = maybeNode || eventOrPayload?.node || null
  const payloadNodes = Array.isArray(maybeNodes)
    ? maybeNodes
    : (Array.isArray(eventOrPayload?.nodes) ? eventOrPayload.nodes : null)

  if (payloadNodes?.length) {
    // 拖拽结束时强制回传最新节点快照，避免 position 偶发不同步。
    emit('update:nodes', payloadNodes)
  }

  const id = String(payloadNode?.id || '').trim()
  if (!id) return
  const next = {
    id,
    position: {
      x: Number(payloadNode?.position?.x || 0),
      y: Number(payloadNode?.position?.y || 0),
    },
  }
  emit('node-position-change', next)
  emit('nodePositionChange', next)
}

function handleNodesChange(changes) {
  const removed = (Array.isArray(changes) ? changes : [])
    .filter((item) => String(item?.type || '').toLowerCase() === 'remove')
    .map((item) => ({ id: String(item?.id || '').trim() }))
    .filter((item) => item.id)
  if (removed.length) {
    emit('nodes-removed', removed)
  }
}

function handleEdgesChange(changes) {
  const removed = (Array.isArray(changes) ? changes : [])
    .filter((item) => String(item?.type || '').toLowerCase() === 'remove')
    .map((item) => ({ id: String(item?.id || '').trim() }))
    .filter((item) => item.id)
  if (removed.length) {
    emit('edges-removed', removed)
  }
}
</script>

<template>
  <div class="workflow-canvas">
    <VueFlow
      v-model:nodes="internalNodes"
      v-model:edges="internalEdges"
      class="canvas-flow"
      :node-types="nodeTypes"
      :fit-view-on-init="true"
      :snap-to-grid="true"
      :default-viewport="{ zoom: 1 }"
      @connect="handleConnect"
      @node-click="handleNodeClick"
      @node-drag-stop="handleNodeDragStop"
      @nodes-change="handleNodesChange"
      @edges-change="handleEdgesChange"
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
  height: 100%;
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
  min-height: 100%;
}
</style>
