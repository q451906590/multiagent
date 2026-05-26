import { Router } from 'express'
import { config } from '../config.js'
import { handleN8nRunEvent } from '../services/workflowExecutionService.js'
import { deliverAgentNodeFiles, executeAgentNode } from '../services/workflowAgentNodeAdapter.js'

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
    const fallbackPrompt = String(payload?.input?.prompt || '').trim()
    const result = await executeAgentNode({
      userId: String(payload.userId || '').trim(),
      agentId: String(payload.agentId || '').trim(),
      prompt: String(payload.prompt || '').trim() || fallbackPrompt,
      uploadedFiles: payload.uploadedFiles,
      timeoutMs: payload.timeoutMs,
    })
    let delivery = null
    if (payload?.deliverToAgentId && Array.isArray(payload?.deliverFiles)) {
      delivery = await deliverAgentNodeFiles({
        fromAgentId: String(payload.agentId || '').trim(),
        toAgentId: String(payload.deliverToAgentId || '').trim(),
        files: payload.deliverFiles,
      })
    }
    return res.json({
      ok: true,
      output: result.output,
      stderr: result.stderr,
      delivery,
    })
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'agent_node_failed' })
  }
})

export default router
