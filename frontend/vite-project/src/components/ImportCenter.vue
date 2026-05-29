<script setup>
import { computed, onMounted } from 'vue'
import { useImportCenter } from '../composables/useImportCenter.js'

const { state, loadImports } = useImportCenter()

onMounted(() => {
  loadImports().catch(() => {})
})

const hasAgentData = computed(() => state.agentItems.length > 0)
const hasWorkflowData = computed(() => state.workflowItems.length > 0)

function formatTime(ts) {
  const value = Number(ts || 0)
  if (!value) return '-'
  return new Date(value).toLocaleString()
}
</script>

<template>
  <section class="import-center">
    <header class="page-head">
      <h2>导入中心</h2>
      <p>查看当前账号从 Agent 市场导入到工作区的全部记录。</p>
    </header>

    <div class="panel">
      <p v-if="state.loading" class="tip">正在加载导入记录...</p>
      <p v-else-if="state.error" class="err">{{ state.error }}</p>
      <p v-else-if="!hasAgentData && !hasWorkflowData" class="tip">暂无导入记录，可先到市集安装模板。</p>

      <h3 v-if="hasAgentData" class="section-title">Agent 导入记录</h3>
      <table v-if="hasAgentData" class="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>来源模板</th>
            <th>标签</th>
            <th>导入时间</th>
            <th>版本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in state.agentItems" :key="item.id">
            <td>
              <span class="emoji">{{ item.agentEmoji || '🤖' }}</span>
              {{ item.agentName || '-' }}
            </td>
            <td>
              <div>{{ item.templateTitle || '-' }}</div>
              <div class="sub">{{ item.publisherUsername ? `作者：${item.publisherUsername}` : '作者：-' }}</div>
            </td>
            <td>
              <div class="tag-row">
                <span v-for="tag in item.tags || []" :key="tag.id" class="tag">{{ tag.name }}</span>
                <span v-if="!(item.tags || []).length" class="sub">-</span>
              </div>
            </td>
            <td>{{ formatTime(item.installedAt) }}</td>
            <td>{{ item.installedVersion || '-' }}</td>
          </tr>
        </tbody>
      </table>

      <h3 v-if="hasWorkflowData" class="section-title">工作流导入记录</h3>
      <table v-if="hasWorkflowData" class="table">
        <thead>
          <tr>
            <th>工作流</th>
            <th>来源模板</th>
            <th>标签</th>
            <th>导入时间</th>
            <th>版本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in state.workflowItems" :key="item.id">
            <td>{{ item.workflowName || '-' }}</td>
            <td>
              <div>{{ item.templateTitle || '-' }}</div>
              <div class="sub">{{ item.publisherUsername ? `作者：${item.publisherUsername}` : '作者：-' }}</div>
            </td>
            <td>
              <div class="tag-row">
                <span v-for="tag in item.tags || []" :key="tag.id" class="tag">{{ tag.name }}</span>
                <span v-if="!(item.tags || []).length" class="sub">-</span>
              </div>
            </td>
            <td>{{ formatTime(item.installedAt) }}</td>
            <td>{{ item.installedVersion || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.import-center {
  min-width: 0;
  padding: 24px 28px 32px;
}

.page-head h2 {
  margin: 0;
  font-size: 24px;
}

.page-head p {
  margin: 6px 0 0;
  color: var(--kd-text-soft);
  font-size: 13px;
}

.panel {
  margin-top: 16px;
  border: 1px solid var(--kd-line);
  border-radius: 12px;
  background: var(--kd-surface);
  overflow: hidden;
}

.section-title {
  margin: 10px 14px;
  font-size: 14px;
  color: var(--kd-text);
}

.tip,
.err {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
}

.tip {
  color: var(--kd-text-soft);
}

.err {
  color: #d13438;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid var(--kd-line);
  font-size: 13px;
  vertical-align: top;
}

.table th {
  color: var(--kd-text-soft);
  font-weight: 500;
  background: var(--kd-bg);
}

.emoji {
  margin-right: 6px;
}

.sub {
  color: var(--kd-text-muted);
  font-size: 12px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  border-radius: 999px;
  border: 1px solid var(--kd-line);
  background: var(--kd-hover);
  padding: 2px 8px;
  font-size: 12px;
  color: var(--kd-text-soft);
}
</style>
