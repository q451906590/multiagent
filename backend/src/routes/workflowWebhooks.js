import { Router } from 'express'
import { config } from '../config.js'
import { listAgentFiles } from '../services/hermes.js'
import { deliverAgentNodeFiles, executeAgentNode } from '../services/workflowAgentNodeAdapter.js'
import { buildResultArchive } from '../services/workflowResultService.js'
import {
  appendWorkflowRunEvent,
  handleN8nRunEvent,
  markWorkflowRunFailed,
} from '../services/workflowExecutionService.js'
import { isWorkflowTerminalNode, resolveAgentNodeExecutionPlan } from '../services/workflowService.js'
import { deliverWorkflowStartInputsToAgent, START_NODE_TYPE } from '../services/workflowInputService.js'
import { resolveWorkflowDeliverablesDir } from '../services/sessionPathService.js'

const router = Router()

function isWebhookAuthorized(req) {
  if (!config.n8nWebhookSecret) return true
  const headerSecret = String(req.headers?.['x-n8n-webhook-secret'] || '').trim()
  const bodySecret = String(req.body?.webhookSecret || '').trim()
  return headerSecret === config.n8nWebhookSecret || bodySecret === config.n8nWebhookSecret
}

router.post('/events', (req, res) => {
  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'invalid_webhook_secret' })
  }
  try {
    const updatedRun = handleN8nRunEvent(req.body || {})
    return res.json({ ok: true, run: updatedRun })
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'event_handle_failed' })
  }
})

router.post('/agent-node', async (req, res) => {
  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'invalid_webhook_secret' })
  }
  try {
    const payload = req.body || {}
    const userId = String(payload.userId || '').trim()
    const workflowId = String(payload.workflowId || '').trim()
    const nodeId = String(payload.nodeId || '').trim()
    const runId = String(payload.runId || '').trim()
    if (!runId) {
      throw new Error('runId is required')
    }
    const fallbackPrompt = String(payload?.input?.prompt || '').trim()

    const plan = resolveAgentNodeExecutionPlan({ workflowId, userId, nodeId })
    const basePrompt = String(payload.prompt || '').trim() || plan.prompt || fallbackPrompt

    const recordEvent = ({ eventType, eventStatus = '', payload: eventPayload = {}, errorMessage = '' }) => {
      if (!runId || !userId) return
      appendWorkflowRunEvent({
        runId,
        userId,
        workflowId,
        nodeId,
        eventType,
        eventStatus,
        payload: eventPayload,
        errorMessage,
      })
    }

    recordEvent({
      eventType: 'node_prepare',
      eventStatus: 'running',
      payload: {
        nodeLabel: plan.nodeLabel,
        agentId: plan.agentId,
        expectedDeliverables: plan.deliverFiles,
        inputDeliverables: plan.inputDeliverables,
      },
    })
    recordEvent({
      eventType: 'node_input',
      eventStatus: 'running',
      payload: {
        nodeInput: payload?.input && typeof payload.input === 'object' ? payload.input : {},
        prompt: basePrompt,
        uploadedFiles: payload.uploadedFiles || plan.uploadedFiles || [],
      },
    })

    const preDeliveries = []
    for (const delivery of plan.preDeliveries) {
      let copied = { delivered: [], failed: [] }
      if (String(delivery?.fromNodeType || '').trim() === START_NODE_TYPE) {
        copied = await deliverWorkflowStartInputsToAgent({
          runId,
          userId,
          toAgentId: delivery.toAgentId,
          startInput: payload?.input?.__workflowStartInput,
          requestedFiles: delivery.files,
        })
      } else {
        copied = await deliverAgentNodeFiles({
          runId,
          fromAgentId: delivery.fromAgentId,
          toAgentId: delivery.toAgentId,
          files: delivery.files,
        })
      }
      preDeliveries.push({
        ...delivery,
        copied,
      })
    }

    const receivedFiles = preDeliveries
      .flatMap((item) => item.copied?.delivered || [])
      .map((path) => `${config.receivedDirInContainer}/${path}`)
    recordEvent({
      eventType: 'node_input_resolved',
      eventStatus: 'running',
      payload: {
        nodeInput: payload?.input && typeof payload.input === 'object' ? payload.input : {},
        prompt: basePrompt,
        receivedFiles,
        preDeliveries: preDeliveries.map((item) => ({
          fromNodeId: item.fromNodeId,
          fromNodeType: item.fromNodeType || '',
          fromAgentId: item.fromAgentId || '',
          toNodeId: item.toNodeId,
          toAgentId: item.toAgentId,
          delivered: item.copied?.delivered || [],
          failed: item.copied?.failed || [],
        })),
      },
    })

    const validateDeliverables = async () => {
      const expected = plan.deliverFiles || []
      if (!expected.length) return { ok: true, missing: [], actual: [] }
      const files = await listAgentFiles(plan.agentId, {
        rootDir: resolveWorkflowDeliverablesDir(runId, plan.agentId),
        maxFiles: 5000,
      })
      const actual = files.map((file) => String(file.path || '').trim()).filter(Boolean)
      const set = new Set(actual)
      const missing = expected.filter((name) => !set.has(name))
      return { ok: missing.length === 0, missing, actual }
    }

    if (!basePrompt) {
      throw new Error('prompt is required')
    }

    let result = await executeAgentNode({
      userId,
      agentId: plan.agentId,
      runId,
      prompt: basePrompt,
      uploadedFiles: payload.uploadedFiles || plan.uploadedFiles,
      receivedFiles,
      deliverableSpecs: plan.deliverFiles,
      timeoutMs: payload.timeoutMs || plan.timeoutMs,
    })
    let check = await validateDeliverables()
    if (!check.ok) {
      recordEvent({
        eventType: 'deliverables_missing',
        eventStatus: 'warning',
        payload: { missing: check.missing, actual: check.actual },
      })
      const retryHint = `Missing required deliverables: ${check.missing.join(', ')}. Re-run and strictly create these filenames.`
      recordEvent({
        eventType: 'retry_once',
        eventStatus: 'running',
        payload: { reason: 'missing_deliverables', missing: check.missing },
      })
      result = await executeAgentNode({
        userId,
        agentId: plan.agentId,
        runId,
        prompt: basePrompt,
        uploadedFiles: payload.uploadedFiles || plan.uploadedFiles,
        receivedFiles,
        deliverableSpecs: plan.deliverFiles,
        retryHint,
        timeoutMs: payload.timeoutMs || plan.timeoutMs,
      })
      check = await validateDeliverables()
      if (!check.ok) {
        const message = `required deliverables missing after retry: ${check.missing.join(', ')}`
        recordEvent({
          eventType: 'deliverables_missing',
          eventStatus: 'failed',
          payload: { missing: check.missing, actual: check.actual },
          errorMessage: message,
        })
        if (runId && userId) {
          markWorkflowRunFailed({
            runId,
            userId,
            workflowId,
            nodeId,
            errorMessage: message,
            payload: { missing: check.missing, actual: check.actual },
          })
        }
        throw new Error(message)
      }
    }

    const postDeliveries = []
    for (const delivery of plan.postDeliveries) {
      const copied = await deliverAgentNodeFiles({
        runId,
        fromAgentId: delivery.fromAgentId,
        toAgentId: delivery.toAgentId,
        files: delivery.files,
      })
      postDeliveries.push({
        ...delivery,
        copied,
      })
    }

    recordEvent({
      eventType: 'node_completed',
      eventStatus: 'succeeded',
      payload: {
        preDeliveries: preDeliveries.map((item) => ({
          fromNodeType: item.fromNodeType || '',
          fromAgentId: item.fromAgentId,
          toAgentId: item.toAgentId,
          delivered: item.copied?.delivered || [],
          failed: item.copied?.failed || [],
        })),
        postDeliveries: postDeliveries.map((item) => ({
          fromAgentId: item.fromAgentId,
          toAgentId: item.toAgentId,
          delivered: item.copied?.delivered || [],
          failed: item.copied?.failed || [],
        })),
      },
    })
    recordEvent({
      eventType: 'node_output',
      eventStatus: 'succeeded',
      payload: {
        nodeOutput: {
          output: result.output,
          stderr: result.stderr || '',
          expectedDeliverables: plan.deliverFiles,
          postDeliveries: postDeliveries.map((item) => ({
            toNodeId: item.toNodeId,
            toAgentId: item.toAgentId,
            delivered: item.copied?.delivered || [],
            failed: item.copied?.failed || [],
          })),
        },
        agentConversation: {
          requestMessage: result.requestMessage || '',
          messages: Array.isArray(result.conversation) ? result.conversation : [],
        },
      },
    })

    if (runId && userId && workflowId && isWorkflowTerminalNode({ workflowId, userId, nodeId })) {
      handleN8nRunEvent({
        runId,
        userId,
        workflowId,
        nodeId,
        eventType: 'run_completed',
        status: 'succeeded',
      })
    }

    return res.json({
      ok: true,
      runId,
      userId,
      workflowId,
      runContext: {
        runId,
        userId,
        workflowId,
        input: payload.input && typeof payload.input === 'object' ? payload.input : {},
      },
      output: result.output,
      stderr: result.stderr,
      receivedFiles,
      expectedDeliverables: plan.deliverFiles,
      preDeliveries,
      postDeliveries,
    })
  } catch (err) {
    const payload = req.body || {}
    const userId = String(payload.userId || '').trim()
    const workflowId = String(payload.workflowId || '').trim()
    const nodeId = String(payload.nodeId || '').trim()
    const runId = String(payload.runId || '').trim()
    if (runId && userId && workflowId) {
      markWorkflowRunFailed({
        runId,
        userId,
        workflowId,
        nodeId,
        errorMessage: err?.message || 'agent_node_failed',
        payload,
      })
    }
    return res.status(400).json({ error: err?.message || 'agent_node_failed' })
  }
})

router.post('/result-node', async (req, res) => {
  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'invalid_webhook_secret' })
  }
  try {
    const payload = req.body || {}
    const userId = String(payload.userId || '').trim()
    const workflowId = String(payload.workflowId || '').trim()
    const nodeId = String(payload.nodeId || '').trim()
    const runId = String(payload.runId || '').trim()
    if (!userId || !workflowId || !nodeId || !runId) {
      return res.status(400).json({ error: 'userId/workflowId/nodeId/runId are required' })
    }
    appendWorkflowRunEvent({
      runId,
      userId,
      workflowId,
      nodeId,
      eventType: 'result_archive_prepare',
      eventStatus: 'running',
      payload: {
        nodeInput: {
          archiveName: String(payload.archiveName || ''),
          resultDeliverables: Array.isArray(payload.resultDeliverables) ? payload.resultDeliverables : [],
        },
      },
    })

    const archive = await buildResultArchive({
      workflowId,
      userId,
      runId,
      nodeId,
    })

    appendWorkflowRunEvent({
      runId,
      userId,
      workflowId,
      nodeId,
      eventType: 'result_archive_ready',
      eventStatus: 'succeeded',
      payload: {
        nodeOutput: {
          archiveName: archive.archiveName,
          downloadPath: archive.downloadPath,
          included: archive.included,
          missing: archive.missing,
        },
        downloadPath: archive.downloadPath,
        archiveName: archive.archiveName,
        includedCount: archive.included.length,
        missingCount: archive.missing.length,
      },
    })

    if (isWorkflowTerminalNode({ workflowId, userId, nodeId })) {
      handleN8nRunEvent({
        runId,
        userId,
        workflowId,
        nodeId,
        eventType: 'run_completed',
        status: 'succeeded',
        output: {
          resultArchive: {
            archiveName: archive.archiveName,
            downloadPath: archive.downloadPath,
            filePath: archive.filePath,
          },
        },
      })
    }

    return res.json({
      ok: true,
      archiveName: archive.archiveName,
      downloadPath: archive.downloadPath,
      included: archive.included,
      missing: archive.missing,
    })
  } catch (err) {
    const payload = req.body || {}
    const userId = String(payload.userId || '').trim()
    const workflowId = String(payload.workflowId || '').trim()
    const nodeId = String(payload.nodeId || '').trim()
    const runId = String(payload.runId || '').trim()
    if (runId && userId && workflowId) {
      markWorkflowRunFailed({
        runId,
        userId,
        workflowId,
        nodeId,
        errorMessage: err?.message || 'result_node_failed',
        payload,
      })
    }
    return res.status(400).json({ error: err?.message || 'result_node_failed' })
  }
})

export default router
