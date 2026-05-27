import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { getWorkflowRunDetail } from '../services/workflowExecutionService.js'

const router = Router()

router.get('/:runId', (req, res) => {
  const detail = getWorkflowRunDetail(req.params.runId, req.user.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  return res.json(detail)
})

router.get('/:runId/result-archive', (req, res) => {
  const detail = getWorkflowRunDetail(req.params.runId, req.user.id)
  if (!detail) return res.status(404).json({ error: 'not_found' })
  const output = detail.output && typeof detail.output === 'object' ? detail.output : {}
  const archive = output.resultArchive && typeof output.resultArchive === 'object' ? output.resultArchive : null
  const filePath = archive?.filePath ? path.resolve(String(archive.filePath)) : ''
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'archive_not_found' })
  }
  const dataDir = path.resolve(config.dataDir)
  if (!filePath.startsWith(dataDir)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const name = String(archive.archiveName || `workflow-run-${req.params.runId}.zip`)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${name.replaceAll('"', '')}"`)
  return res.sendFile(filePath)
})

export default router
