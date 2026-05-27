<script setup>
import { computed, reactive, watch } from 'vue'
import {
  buildDeliverableCatalog,
  deliverableRefKey,
  normalizeDeliverFiles,
  normalizeInputDeliverables,
} from '../../utils/workflowDeliverables.js'
import { getDefaultNodeParameters } from '../../features/workflow/nodeDefinitions.js'

const props = defineProps({
  node: { type: Object, default: null },
  allNodes: { type: Array, default: () => [] },
})

const emit = defineEmits(['update-node', 'delete-node'])

const form = reactive({
  label: '',
  prompt: '',
  timeoutMs: 0,
  deliverFilesText: '',
  selectedInputRefs: [],
  selectedResultRefs: [],
  archiveName: 'workflow-result.zip',
  agentIoError: '',
  ifLeftValue: '',
  ifOperator: 'equals',
  ifRightValue: '',
  ifCaseSensitive: true,
  ifCombinator: 'and',
  switchMode: 'rules',
  switchValue1: '',
  switchOperation: 'equals',
  switchValue2: '',
  switchFallbackOutput: 'extra',
  switchOutputCount: 3,
  mergeMode: 'append',
  waitAmount: 1,
  waitUnit: 'minutes',
  advancedMode: false,
  genericParametersText: '{}',
  genericParametersError: '',
})

const isAgentNode = computed(() => {
  const type = String(props.node?.type || '').trim()
  return type === 'agent' || type === 'agent.chat'
})
const nodeType = computed(() => String(props.node?.type || '').trim().toLowerCase())
const isIfNode = computed(() => nodeType.value === 'if')
const isSwitchNode = computed(() => nodeType.value === 'switch')
const isMergeNode = computed(() => nodeType.value === 'merge')
const isWaitNode = computed(() => nodeType.value === 'wait')
const isResultNode = computed(() => nodeType.value === 'result')
const isGenericNode = computed(() => !isAgentNode.value && !isResultNode.value && Boolean(props.node))

const deliverableCatalog = computed(() =>
  buildDeliverableCatalog(props.allNodes, { excludeNodeId: String(props.node?.id || '') })
)

function deriveParametersFromForm(type) {
  const nodeTypeValue = String(type || '').trim().toLowerCase()
  if (nodeTypeValue === 'if') {
    return {
      conditions: {
        options: {
          caseSensitive: Boolean(form.ifCaseSensitive),
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [{
          leftValue: String(form.ifLeftValue || ''),
          operator: { type: String(form.ifOperator || 'equals') },
          rightValue: String(form.ifRightValue || ''),
        }],
        combinator: String(form.ifCombinator || 'and'),
      },
    }
  }
  if (nodeTypeValue === 'switch') {
    return {
      mode: String(form.switchMode || 'rules'),
      rules: {
        rules: [{
          value1: String(form.switchValue1 || ''),
          operation: String(form.switchOperation || 'equals'),
          value2: String(form.switchValue2 || ''),
        }],
      },
      fallbackOutput: String(form.switchFallbackOutput || 'extra'),
    }
  }
  if (nodeTypeValue === 'merge') return { mode: String(form.mergeMode || 'append') }
  if (nodeTypeValue === 'wait') {
    return {
      resume: 'timeInterval',
      amount: Math.max(1, Number(form.waitAmount || 1)),
      unit: String(form.waitUnit || 'minutes'),
    }
  }
  return {}
}

function hydrateFormFromParameters(type, parameters) {
  const params = parameters && typeof parameters === 'object' ? parameters : getDefaultNodeParameters(type)
  const condition = params?.conditions?.conditions?.[0] || {}
  form.ifLeftValue = String(condition?.leftValue || '')
  form.ifOperator = String(condition?.operator?.type || 'equals')
  form.ifRightValue = String(condition?.rightValue || '')
  form.ifCaseSensitive = params?.conditions?.options?.caseSensitive !== false
  form.ifCombinator = String(params?.conditions?.combinator || 'and')

  const switchRule = params?.rules?.rules?.[0] || {}
  form.switchMode = String(params?.mode || 'rules')
  form.switchValue1 = String(switchRule?.value1 || '')
  form.switchOperation = String(switchRule?.operation || 'equals')
  form.switchValue2 = String(switchRule?.value2 || '')
  form.switchFallbackOutput = String(params?.fallbackOutput || 'extra')
  form.switchOutputCount = Math.min(6, Math.max(2, Math.floor(Number(props.node?.data?.outputCount || 3))))

  form.mergeMode = String(params?.mode || 'append')
  form.waitAmount = Math.max(1, Number(params?.amount || 1))
  form.waitUnit = String(params?.unit || 'minutes')
}

function parseDeliverFilesText() {
  return normalizeDeliverFiles(
    String(form.deliverFilesText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )
}

function isInputRefSelected(item) {
  const key = deliverableRefKey(item)
  return form.selectedInputRefs.some((ref) => deliverableRefKey(ref) === key)
}

function toggleInputRef(item, checked) {
  const key = deliverableRefKey(item)
  const next = form.selectedInputRefs.filter((ref) => deliverableRefKey(ref) !== key)
  if (checked) {
    next.push({
      sourceNodeId: item.sourceNodeId,
      sourceAgentId: item.sourceAgentId,
      path: item.path,
    })
  }
  form.selectedInputRefs = normalizeInputDeliverables(next)
}

function isResultRefSelected(item) {
  const key = deliverableRefKey(item)
  return form.selectedResultRefs.some((ref) => deliverableRefKey(ref) === key)
}

function toggleResultRef(item, checked) {
  const key = deliverableRefKey(item)
  const next = form.selectedResultRefs.filter((ref) => deliverableRefKey(ref) !== key)
  if (checked) {
    next.push({
      sourceNodeId: item.sourceNodeId,
      sourceAgentId: item.sourceAgentId,
      path: item.path,
    })
  }
  form.selectedResultRefs = normalizeInputDeliverables(next)
}

watch(
  () => props.node,
  (next) => {
    form.label = String(next?.label || next?.data?.label || '')
    form.prompt = String(next?.data?.prompt || '')
    form.timeoutMs = Number(next?.data?.timeoutMs || 0)
    const deliverFiles = normalizeDeliverFiles(next?.data?.deliverFiles)
    form.deliverFilesText = deliverFiles.join('\n')
    form.selectedInputRefs = normalizeInputDeliverables(next?.data?.inputDeliverables)
    form.selectedResultRefs = normalizeInputDeliverables(next?.data?.resultDeliverables)
    form.archiveName = String(next?.data?.archiveName || 'workflow-result.zip')
    form.agentIoError = ''

    const configuredParameters = next?.data?.parameters && typeof next.data.parameters === 'object'
      ? next.data.parameters
      : getDefaultNodeParameters(next?.type)
    hydrateFormFromParameters(next?.type, configuredParameters)
    form.genericParametersText = JSON.stringify(configuredParameters, null, 2)
    form.genericParametersError = ''
    form.advancedMode = false
  },
  { immediate: true }
)

watch(
  () => form.advancedMode,
  (enabled) => {
    if (!enabled || !isGenericNode.value) return
    form.genericParametersText = JSON.stringify(deriveParametersFromForm(nodeType.value), null, 2)
    form.genericParametersError = ''
  }
)

function applyChanges() {
  if (!props.node) return
  let genericParameters = deriveParametersFromForm(props.node?.type)
  if (isGenericNode.value && form.advancedMode) {
    try {
      const parsed = JSON.parse(String(form.genericParametersText || '{}'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        form.genericParametersError = '通用节点参数必须是 JSON 对象'
        return
      }
      genericParameters = parsed
      form.genericParametersError = ''
    } catch (_) {
      form.genericParametersError = 'JSON 格式错误，请修正后再应用'
      return
    }
  }

  let deliverFiles = props.node?.data?.deliverFiles
  let inputDeliverables = props.node?.data?.inputDeliverables
  let resultDeliverables = props.node?.data?.resultDeliverables
  let archiveName = props.node?.data?.archiveName
  if (isAgentNode.value) {
    deliverFiles = parseDeliverFilesText()
    inputDeliverables = normalizeInputDeliverables(form.selectedInputRefs)
    const currentAgentId = String(props.node?.data?.agentId || '').trim()
    const siblingFiles = new Set(
      (Array.isArray(props.allNodes) ? props.allNodes : [])
        .filter((item) => String(item?.id || '') !== String(props.node?.id || ''))
        .filter((item) => String(item?.type || '') === 'agent')
        .filter((item) => String(item?.data?.agentId || '').trim() === currentAgentId)
        .flatMap((item) => normalizeDeliverFiles(item?.data?.deliverFiles))
    )
    const conflict = deliverFiles.filter((file) => siblingFiles.has(file))
    if (conflict.length) {
      form.agentIoError = `同一 Agent 内交付物名称必须唯一，冲突项：${[...new Set(conflict)].join(', ')}`
      return
    }
    form.agentIoError = ''
  }
  if (isResultNode.value) {
    resultDeliverables = normalizeInputDeliverables(form.selectedResultRefs)
    archiveName = String(form.archiveName || '').trim() || 'workflow-result.zip'
    if (!archiveName.toLowerCase().endsWith('.zip')) {
      archiveName = `${archiveName}.zip`
    }
  }

  emit('update-node', {
    ...props.node,
    label: form.label,
    data: {
      ...(props.node?.data || {}),
      prompt: form.prompt,
      timeoutMs: Number(form.timeoutMs || 0),
      deliverFiles,
      inputDeliverables,
      resultDeliverables,
      archiveName,
      parameters: genericParameters,
      outputCount: isSwitchNode.value
        ? Math.min(6, Math.max(2, Math.floor(Number(form.switchOutputCount || 3))))
        : props.node?.data?.outputCount,
      label: form.label,
    },
  })
}

function removeNode() {
  if (!props.node) return
  emit('delete-node', props.node.id)
}
</script>

<template>
  <aside class="inspector">
    <h3>属性</h3>
    <div v-if="!node" class="empty">请选择一个节点</div>
    <template v-else>
      <label class="field">
        <span>节点标题</span>
        <input v-model="form.label" type="text" placeholder="请输入标题" />
      </label>
      <label v-if="isAgentNode" class="field">
        <span>Agent Prompt</span>
        <textarea
          v-model="form.prompt"
          rows="6"
          placeholder="该节点执行时发送给 Agent 的指令"
        />
      </label>
      <label v-if="isAgentNode" class="field">
        <span>超时（毫秒）</span>
        <input v-model.number="form.timeoutMs" type="number" min="0" step="1000" />
      </label>
      <label v-if="isAgentNode" class="field">
        <span>交付物文件名（每行一个，相对 /opt/data/deliverables）</span>
        <textarea
          v-model="form.deliverFilesText"
          rows="5"
          placeholder="例如：\nreport.md\nassets/summary.json"
        />
      </label>
      <div v-if="isAgentNode" class="field">
        <span>接收物选择（来自其他 Agent 已定义交付物）</span>
        <div class="deliverable-picker">
          <label
            v-for="item in deliverableCatalog"
            :key="`${item.sourceNodeId}::${item.path}`"
            class="deliverable-option"
          >
            <input
              type="checkbox"
              :checked="isInputRefSelected(item)"
              @change="toggleInputRef(item, $event?.target?.checked)"
            />
            <span>{{ item.displayLabel }}</span>
            <small v-if="item.hasAgentConflict">同Agent存在重名</small>
          </label>
          <div v-if="!deliverableCatalog.length" class="hint-text">
            当前暂无可选接收物，请先在其他 Agent 节点定义交付物。
          </div>
        </div>
      </div>
      <div v-if="isResultNode" class="field">
        <span>结果节点打包文件名</span>
        <input v-model="form.archiveName" type="text" placeholder="workflow-result.zip" />
      </div>
      <div v-if="isResultNode" class="field">
        <span>打包内容（从所有 Agent 交付物中选择）</span>
        <div class="deliverable-picker">
          <label
            v-for="item in deliverableCatalog"
            :key="`result-${item.sourceNodeId}::${item.path}`"
            class="deliverable-option"
          >
            <input
              type="checkbox"
              :checked="isResultRefSelected(item)"
              @change="toggleResultRef(item, $event?.target?.checked)"
            />
            <span>{{ item.displayLabel }}</span>
          </label>
          <div v-if="!deliverableCatalog.length" class="hint-text">
            当前暂无可打包交付物，请先在 Agent 节点定义交付物。
          </div>
        </div>
      </div>
      <template v-if="isGenericNode">
        <template v-if="isIfNode">
          <label class="field">
            <span>左值（变量/表达式）</span>
            <input v-model="form.ifLeftValue" type="text" placeholder='例如：{{$json.status}}' />
          </label>
          <label class="field">
            <span>比较符</span>
            <select v-model="form.ifOperator">
              <option value="equals">等于</option>
              <option value="notEquals">不等于</option>
              <option value="contains">包含</option>
              <option value="notContains">不包含</option>
              <option value="startsWith">以...开头</option>
              <option value="endsWith">以...结尾</option>
              <option value="isEmpty">为空</option>
              <option value="isNotEmpty">非空</option>
            </select>
          </label>
          <label class="field">
            <span>右值</span>
            <input v-model="form.ifRightValue" type="text" placeholder="例如：success" />
          </label>
          <label class="field">
            <span>条件组合</span>
            <select v-model="form.ifCombinator">
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </label>
          <label class="field checkbox-field">
            <input v-model="form.ifCaseSensitive" type="checkbox" />
            <span>大小写敏感</span>
          </label>
        </template>

        <template v-if="isSwitchNode">
          <label class="field">
            <span>输出分支数量</span>
            <select v-model.number="form.switchOutputCount">
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
              <option :value="6">6</option>
            </select>
          </label>
          <label class="field">
            <span>分支模式</span>
            <select v-model="form.switchMode">
              <option value="rules">规则模式（推荐）</option>
              <option value="expression">表达式模式</option>
            </select>
          </label>
          <label class="field">
            <span>待判断值（value1）</span>
            <input v-model="form.switchValue1" type="text" placeholder='例如：{{$json.level}}' />
          </label>
          <label class="field">
            <span>比较符</span>
            <select v-model="form.switchOperation">
              <option value="equals">等于</option>
              <option value="notEquals">不等于</option>
              <option value="contains">包含</option>
              <option value="notContains">不包含</option>
              <option value="startsWith">以...开头</option>
              <option value="endsWith">以...结尾</option>
            </select>
          </label>
          <label class="field">
            <span>匹配值（value2）</span>
            <input v-model="form.switchValue2" type="text" placeholder="例如：high" />
          </label>
          <label class="field">
            <span>默认分支</span>
            <select v-model="form.switchFallbackOutput">
              <option value="extra">输出到额外分支</option>
              <option value="none">不输出</option>
            </select>
          </label>
        </template>

        <template v-if="isMergeNode">
          <label class="field">
            <span>合并模式</span>
            <select v-model="form.mergeMode">
              <option value="append">Append（串联）</option>
              <option value="combine">Combine（按字段合并）</option>
              <option value="mergeByPosition">Merge By Position（按位置）</option>
              <option value="chooseBranch">Choose Branch（选分支）</option>
            </select>
          </label>
        </template>

        <template v-if="isWaitNode">
          <label class="field">
            <span>等待时长</span>
            <input v-model.number="form.waitAmount" type="number" min="1" step="1" />
          </label>
          <label class="field">
            <span>时间单位</span>
            <select v-model="form.waitUnit">
              <option value="seconds">秒</option>
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
              <option value="days">天</option>
            </select>
          </label>
        </template>

        <label class="field checkbox-field advanced-toggle">
          <input v-model="form.advancedMode" type="checkbox" />
          <span>高级模式（直接编辑 JSON）</span>
        </label>
        <label v-if="form.advancedMode" class="field">
          <span>通用节点参数（n8n parameters JSON）</span>
          <textarea
            v-model="form.genericParametersText"
            rows="10"
            placeholder='例如：{"mode":"append"}'
          />
        </label>
      </template>
      <div v-if="form.agentIoError" class="error-text">{{ form.agentIoError }}</div>
      <div v-if="form.genericParametersError" class="error-text">{{ form.genericParametersError }}</div>
      <div class="actions">
        <button class="btn primary" @click="applyChanges">应用修改</button>
        <button class="btn danger" @click="removeNode">删除节点</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  width: 300px;
  flex: 0 0 300px;
  background: var(--kd-surface);
  border: 1px solid var(--kd-line);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
  align-content: start;
}

h3 {
  margin: 0;
  font-size: 14px;
}

.empty {
  color: var(--kd-text-muted);
  font-size: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--kd-text-soft);
}

input,
textarea,
select {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.checkbox-field {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.advanced-toggle {
  margin-top: 2px;
}

.deliverable-picker {
  border: 1px solid var(--kd-line);
  border-radius: 8px;
  background: #fff;
  max-height: 180px;
  overflow: auto;
  padding: 8px;
  display: grid;
  gap: 6px;
}

.deliverable-option {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--kd-text-soft);
}

.deliverable-option small {
  grid-column: 2 / span 1;
  color: #be2d33;
}

.hint-text {
  font-size: 12px;
  color: var(--kd-text-muted);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  height: 30px;
  border-radius: 8px;
  padding: 0 10px;
  border: 1px solid var(--kd-line);
}

.btn.primary {
  border-color: var(--kd-primary);
  color: var(--kd-primary);
}

.btn.danger {
  border-color: #f2c5c7;
  color: #be2d33;
}

.error-text {
  font-size: 12px;
  color: #be2d33;
}
</style>
