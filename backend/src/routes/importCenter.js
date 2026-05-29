import { Router } from 'express'
import { listImportCenterItems, listImportCenterWorkflowItems } from '../services/importCenterService.js'

const router = Router()

router.get('/agents', (req, res) => {
  res.json(listImportCenterItems(req.user.id))
})

router.get('/workflows', (req, res) => {
  res.json(listImportCenterWorkflowItems(req.user.id))
})

export default router
