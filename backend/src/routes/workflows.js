import { Router } from 'express'
import multer from 'multer'
import {
  activateWorkflow,
  createWorkflow,
  getWorkflowDetail,
  listWorkflowSummaries,
  publishWorkflow,
  removeWorkflow,
  updateWorkflowDraft,
} from '../services/workflowService.js'
import { listRunsForWorkflow, triggerWorkflowRun } from '../services/workflowExecutionService.js'
import { saveWorkflowInputUploads } from '../services/workflowInputService.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 20 * 1024 * 1024,
  },
})

router.get('/', (req, res) => {
  res.json(listWorkflowSummaries(req.user.id))
})

router.post('/', (req, res) => {
  try {
    const created = createWorkflow(req.body || {}, req.user.id)
    res.status(201).json(created)
  } catch (err) {
    res.status(400).json({ error: err?.message || 'create_workflow_failed' })
  }
})

router.get('/:id', (req, res) => {
  const workflow = getWorkflowDetail(req.params.id, req.user.id)
  if (!workflow) return res.status(404).json({ error: 'not_found' })
  return res.json(workflow)
})

router.patch('/:id', (req, res) => {
  try {
    const updated = updateWorkflowDraft(req.params.id, req.body || {}, req.user.id)
    res.json(updated)
  } catch (err) {
    const message = String(err?.message || '')
    const code = message.includes('not found') ? 404 : 400
    res.status(code).json({ error: message || 'update_workflow_failed' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const removed = await removeWorkflow(req.params.id, req.user.id)
    if (!removed) return res.status(404).json({ error: 'not_found' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'delete_workflow_failed' })
  }
})

router.post('/:id/publish', async (req, res) => {
  try {
    const published = await publishWorkflow(req.params.id, req.user.id)
    res.json(published)
  } catch (err) {
    const message = String(err?.message || '')
    const code = message.includes('not found') ? 404 : 400
    res.status(code).json({ error: message || 'publish_failed' })
  }
})

router.post('/:id/activate', async (req, res) => {
  const active = req.body?.active !== false
  try {
    const updated = await activateWorkflow(req.params.id, req.user.id, active)
    res.json(updated)
  } catch (err) {
    const message = String(err?.message || '')
    const code = message.includes('not found') ? 404 : 400
    res.status(code).json({ error: message || 'activate_failed' })
  }
})

router.post('/:id/runs', async (req, res) => {
  try {
    const run = await triggerWorkflowRun({
      workflowId: req.params.id,
      userId: req.user.id,
      input: req.body?.input && typeof req.body.input === 'object' ? req.body.input : {},
      triggerSource: 'manual',
    })
    res.status(201).json(run)
  } catch (err) {
    const message = String(err?.message || '')
    const code = message.includes('not found') ? 404 : 400
    res.status(code).json({ error: message || 'run_trigger_failed' })
  }
})

router.post('/uploads', upload.array('files', 10), (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    const result = saveWorkflowInputUploads({
      userId: req.user.id,
      files,
    })
    res.status(201).json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message || 'workflow_input_upload_failed' })
  }
})

router.get('/:id/runs', (req, res) => {
  const workflow = getWorkflowDetail(req.params.id, req.user.id)
  if (!workflow) return res.status(404).json({ error: 'not_found' })
  const limit = Number(req.query?.limit || 30)
  const runs = listRunsForWorkflow(req.params.id, req.user.id, { limit })
  return res.json(runs)
})

export default router
