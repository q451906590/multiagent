import { Router } from 'express'
import { listImportCenterItems } from '../services/importCenterService.js'

const router = Router()

router.get('/agents', (req, res) => {
  res.json(listImportCenterItems(req.user.id))
})

export default router
