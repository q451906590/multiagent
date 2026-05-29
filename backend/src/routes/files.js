import { Router } from 'express'
import { getAgent } from '../db.js'
import multer from 'multer'
import path from 'node:path'
import tar from 'tar-stream'
import JSZip from 'jszip'
import {
  copyFilesBetweenAgents,
  deleteAgentFileByScope,
  listAgentFiles,
  containerNameFor,
  findContainer,
  safeRelPath,
  writeFileToContainer,
} from '../services/hermes.js'
import { config } from '../config.js'

const router = Router({ mergeParams: true })
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 20 * 1024 * 1024,
  },
})

function sanitizeFilename(name, fallback = 'file') {
  const base = path.posix.basename(String(name || '').replaceAll('\\', '/')).trim()
  const compact = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return compact || fallback
}

function buildUploadRelPath(relativeDir, originalname) {
  const safeName = sanitizeFilename(originalname)
  const datePrefix = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const dir = String(relativeDir || '').trim()
  const rel = dir ? `${dir}/${datePrefix}-${safeName}` : `${datePrefix}-${safeName}`
  return safeRelPath(rel)
}

function ensureAgent(req, res, field = 'id') {
  const agentId = req.params[field]
  const agent = getAgent(agentId, req.user.id)
  if (!agent) {
    res.status(404).json({ error: 'agent_not_found' })
    return null
  }
  return agentId
}

function detectContentType(filePath) {
  const ext = path.posix.extname(String(filePath || '')).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }
  return map[ext] || 'application/octet-stream'
}

function resolveScopeRootDir(scope) {
  if (scope === 'inbox') return config.uploadInboxDirInContainer
  if (scope === 'received') return config.receivedDirInContainer
  return config.deliveryDirInContainer
}

async function readAgentFileBuffer(agentId, relPath, { rootDir }) {
  const absPath = path.posix.join(rootDir, relPath)
  const containerName = await ensureContainerReady(agentId)
  const container = await findContainer(containerName)
  if (!container) {
    throw new Error('container_not_found')
  }
  const archiveStream = await container.getArchive({ path: absPath })
  const archiveBuffer = await streamToBuffer(archiveStream)
  return extractFirstFileFromTar(archiveBuffer)
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function extractFirstFileFromTar(archiveBuffer, { maxBytes = 15 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const extract = tar.extract()
    let done = false
    let sawFile = false

    function finishResolve(value) {
      if (done) return
      done = true
      resolve(value)
    }

    function finishReject(err) {
      if (done) return
      done = true
      reject(err)
    }

    extract.on('entry', (header, stream, next) => {
      if (done) {
        stream.resume()
        stream.on('end', next)
        return
      }
      if (header.type !== 'file') {
        stream.resume()
        stream.on('end', next)
        return
      }
      sawFile = true
      const chunks = []
      let size = 0
      stream.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          finishReject(new Error(`file too large (>${maxBytes} bytes)`))
          try { stream.destroy() } catch (_) {}
          return
        }
        chunks.push(chunk)
      })
      stream.on('error', finishReject)
      stream.on('end', () => {
        finishResolve(Buffer.concat(chunks))
        next()
      })
    })

    extract.on('finish', () => {
      if (!done) {
        if (!sawFile) finishReject(new Error('no file entry in archive'))
      }
    })
    extract.on('error', finishReject)
    extract.end(archiveBuffer)
  })
}

async function ensureContainerReady(agentId) {
  const containerName = containerNameFor(agentId)
  const container = await findContainer(containerName)
  if (!container) {
    throw new Error(`container ${containerName} not found, run /api/system/bootstrap first`)
  }
  const info = await container.inspect()
  if (!info.State?.Running) {
    await container.start()
  }
  return containerName
}

router.get('/', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return
  const scope = String(req.query?.scope || 'delivery').trim().toLowerCase()
  if (!['delivery', 'received'].includes(scope)) {
    return res.status(400).json({ error: 'invalid scope' })
  }
  const rootDir = scope === 'received' ? config.receivedDirInContainer : config.deliveryDirInContainer
  try {
    const items = await listAgentFiles(agentId, { rootDir })
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'files_list_failed', message: err?.message || String(err) })
  }
})

router.post('/deliver', async (req, res) => {
  const sourceAgentId = ensureAgent(req, res)
  if (!sourceAgentId) return

  const targetAgentId = String(req.body?.targetAgentId || '').trim()
  const files = Array.isArray(req.body?.files) ? req.body.files : []
  if (!targetAgentId) {
    return res.status(400).json({ error: 'targetAgentId is required' })
  }
  if (files.length === 0) {
    return res.status(400).json({ error: 'files is required' })
  }
  const targetExists = getAgent(targetAgentId, req.user.id)
  if (!targetExists) {
    return res.status(404).json({ error: 'target_agent_not_found' })
  }
  if (targetAgentId === sourceAgentId) {
    return res.status(400).json({ error: 'targetAgentId must be different from source agent' })
  }

  try {
    const result = await copyFilesBetweenAgents({
      fromAgentId: sourceAgentId,
      toAgentId: targetAgentId,
      paths: files,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: 'files_deliver_failed', message: err?.message || String(err) })
  }
})

router.post('/upload', upload.array('files', 10), async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return

  const files = Array.isArray(req.files) ? req.files : []
  if (files.length === 0) {
    return res.status(400).json({ error: 'files is required' })
  }

  const relativeDirRaw = String(req.body?.relativeDir || '').trim()
  let relativeDir = ''
  if (relativeDirRaw) {
    try {
      relativeDir = safeRelPath(relativeDirRaw)
    } catch (err) {
      return res.status(400).json({ error: 'invalid relativeDir', message: err?.message || String(err) })
    }
  }

  try {
    const containerName = await ensureContainerReady(agentId)
    const uploaded = []
    for (const file of files) {
      const relPath = buildUploadRelPath(relativeDir, file.originalname)
      const dir = path.posix.dirname(relPath)
      const filename = path.posix.basename(relPath)
      const destDir = path.posix.join(config.uploadInboxDirInContainer, dir)
      await writeFileToContainer(containerName, destDir, filename, file.buffer)
      uploaded.push({
        path: relPath,
        name: file.originalname,
        size: Number(file.size || 0),
        mimeType: String(file.mimetype || ''),
      })
    }
    res.status(201).json({ uploaded })
  } catch (err) {
    res.status(500).json({ error: 'files_upload_failed', message: err?.message || String(err) })
  }
})

router.delete('/', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return

  const scope = String(req.body?.scope || 'delivery').trim().toLowerCase()
  if (!['delivery', 'received'].includes(scope)) {
    return res.status(400).json({ error: 'invalid scope' })
  }

  const rawPath = String(req.body?.path || '').trim()
  if (!rawPath) {
    return res.status(400).json({ error: 'path is required' })
  }

  let relPath = ''
  try {
    relPath = safeRelPath(rawPath)
  } catch (err) {
    return res.status(400).json({ error: 'invalid path', message: err?.message || String(err) })
  }

  try {
    const result = await deleteAgentFileByScope({
      agentId,
      scope,
      relPath,
    })
    if (!result.deleted) {
      return res.status(404).json({ error: 'file_not_found', path: relPath })
    }
    res.json({ ok: true, path: result.path })
  } catch (err) {
    res.status(500).json({ error: 'file_delete_failed', message: err?.message || String(err) })
  }
})

router.get('/raw', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return

  const rawPath = String(req.query?.path || '').trim()
  if (!rawPath) {
    return res.status(400).json({ error: 'path is required' })
  }

  let relPath = ''
  try {
    relPath = safeRelPath(rawPath)
  } catch (err) {
    return res.status(400).json({ error: 'invalid path', message: err?.message || String(err) })
  }

  const scope = String(req.query?.scope || 'delivery').trim().toLowerCase()
  if (!['delivery', 'inbox', 'received'].includes(scope)) {
    return res.status(400).json({ error: 'invalid scope' })
  }

  try {
    const rootDir = resolveScopeRootDir(scope)
    const fileBuffer = await readAgentFileBuffer(agentId, relPath, { rootDir })
    res.setHeader('Content-Type', detectContentType(relPath))
    res.setHeader('Cache-Control', 'no-store')
    res.send(fileBuffer)
  } catch (err) {
    const msg = err?.message || String(err)
    if (msg === 'container_not_found') {
      return res.status(404).json({ error: 'container_not_found' })
    }
    if (msg.includes('no such file') || msg.includes('not found')) {
      return res.status(404).json({ error: 'file_not_found', message: msg })
    }
    res.status(500).json({ error: 'file_read_failed', message: msg })
  }
})

router.post('/download-zip', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return

  const scope = String(req.body?.scope || 'delivery').trim().toLowerCase()
  if (!['delivery', 'inbox', 'received'].includes(scope)) {
    return res.status(400).json({ error: 'invalid scope' })
  }

  const rawFiles = Array.isArray(req.body?.files) ? req.body.files : []
  if (rawFiles.length === 0) {
    return res.status(400).json({ error: 'files is required' })
  }

  let files = []
  try {
    files = [...new Set(rawFiles.map((item) => safeRelPath(item)))]
  } catch (err) {
    return res.status(400).json({ error: 'invalid file path', message: err?.message || String(err) })
  }

  try {
    const zip = new JSZip()
    const failed = []
    for (const relPath of files) {
      try {
        const rootDir = resolveScopeRootDir(scope)
        const fileBuffer = await readAgentFileBuffer(agentId, relPath, { rootDir })
        zip.file(relPath, fileBuffer)
      } catch (err) {
        failed.push({ path: relPath, error: err?.message || String(err) })
      }
    }

    const includedCount = files.length - failed.length
    if (includedCount <= 0) {
      return res.status(404).json({
        error: 'files_not_found',
        message: 'none of requested files could be downloaded',
        failed,
      })
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const filename = `${sanitizeFilename(agentId, 'agent')}-${scope}-${stamp}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    if (failed.length > 0) {
      res.setHeader('X-Failed-Files', encodeURIComponent(JSON.stringify(failed)))
    }
    res.send(zipBuffer)
  } catch (err) {
    res.status(500).json({ error: 'files_zip_failed', message: err?.message || String(err) })
  }
})

router.get('/preview/:scope/*', async (req, res) => {
  const agentId = ensureAgent(req, res)
  if (!agentId) return

  const scope = String(req.params?.scope || '').trim().toLowerCase()
  if (!['delivery', 'inbox', 'received'].includes(scope)) {
    return res.status(400).json({ error: 'invalid scope' })
  }

  const routePath = String(req.params?.[0] || '').trim()
  if (!routePath) {
    return res.status(400).json({ error: 'path is required' })
  }

  let relPath = ''
  try {
    relPath = safeRelPath(routePath)
  } catch (err) {
    return res.status(400).json({ error: 'invalid path', message: err?.message || String(err) })
  }

  try {
    const rootDir = resolveScopeRootDir(scope)
    const fileBuffer = await readAgentFileBuffer(agentId, relPath, { rootDir })
    res.setHeader('Content-Type', detectContentType(relPath))
    res.setHeader('Cache-Control', 'no-store')
    res.send(fileBuffer)
  } catch (err) {
    const msg = err?.message || String(err)
    if (msg === 'container_not_found') {
      return res.status(404).json({ error: 'container_not_found' })
    }
    if (msg.includes('no such file') || msg.includes('not found')) {
      return res.status(404).json({ error: 'file_not_found', message: msg })
    }
    res.status(500).json({ error: 'file_read_failed', message: msg })
  }
})

export default router
