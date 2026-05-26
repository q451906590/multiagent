import { Router } from 'express'
import { getWorkflowRunDetail } from '../services/workflowExecutionService.js'

const router = Router()

router.get('/:runId', (req, res) => {
  const detail = getWorkflowRunDetail(req.params.runId, req.user.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  return res.json(detail)
})

export default router
