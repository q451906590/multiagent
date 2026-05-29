function normalizeType(type) {
  return String(type || '').trim().toLowerCase()
}

function cloneData(data) {
  return data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : {}
}

export function getDefaultNodeParameters(type) {
  const nodeType = normalizeType(type)
  if (nodeType === 'if') {
    return {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [],
        combinator: 'and',
      },
    }
  }
  if (nodeType === 'switch') {
    return {
      mode: 'rules',
      rules: {
        rules: [],
      },
      fallbackOutput: 'extra',
    }
  }
  if (nodeType === 'merge') return { mode: 'append' }
  if (nodeType === 'wait') return { resume: 'timeInterval', amount: 1, unit: 'minutes' }
  return {}
}

export const baseNodeDefinitions = [
  {
    type: 'start.userInput',
    label: '用户输入开始',
    icon: '▶',
    data: {},
  },
  {
    type: 'if',
    label: '条件分支 IF',
    icon: '◇',
    data: {
      parameters: getDefaultNodeParameters('if'),
    },
  },
  {
    type: 'switch',
    label: '分支 Switch',
    icon: '⎇',
    data: {
      outputCount: 3,
      outputLabels: ['分支1', '分支2', '默认'],
      parameters: getDefaultNodeParameters('switch'),
    },
  },
  {
    type: 'merge',
    label: '合并 Merge',
    icon: '⋈',
    data: {
      parameters: getDefaultNodeParameters('merge'),
    },
  },
  {
    type: 'wait',
    label: '等待 Wait',
    icon: '◴',
    data: {
      parameters: getDefaultNodeParameters('wait'),
    },
  },
  {
    type: 'result',
    label: '结果输出',
    icon: '⬇',
    data: {
      resultDeliverables: [],
      archiveName: 'workflow-result.zip',
    },
  },
]

export function buildAgentNodeDefinitions(agents) {
  const list = Array.isArray(agents) ? agents : []
  return list.map((agent) => ({
    type: 'agent',
    label: `${agent.emoji || '🤖'} ${agent.name || agent.id}`,
    icon: '🤖',
    data: {
      agentId: agent.id,
      prompt: '',
      uploadedFiles: [],
      timeoutMs: 0,
      deliverFiles: [],
      inputDeliverables: [],
    },
  }))
}

export function getNodeDefinitionByType(type, agents = []) {
  const nodeType = normalizeType(type)
  const base = baseNodeDefinitions.find((item) => normalizeType(item.type) === nodeType)
  if (base) return { ...base, data: cloneData(base.data) }
  if (nodeType === 'agent') {
    const firstAgent = buildAgentNodeDefinitions(agents)[0]
    return firstAgent ? { ...firstAgent, data: cloneData(firstAgent.data) } : null
  }
  return null
}
