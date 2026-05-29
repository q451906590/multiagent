import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { containerNameFor, ensureContainerRunning, safeRelPath, writeFileToContainer } from './hermes.js'
import { resolveWorkflowReceivedRelPath } from './sessionPathService.js'

export const START_NODE_TYPE = 'start.userInput'
export const START_INPUT_SOURCE_ALIAS = '__workflow_input__'
export const START_TEXT_DELIVERABLE = 'user-input'
export const START_UPLOADS_DELIVERABLE = 'user-uploaded-files'
const LEGACY_TEXT_DELIVERABLE = 'user-input.txt'
const LEGACY_UPLOADS_DELIVERABLE = 'user-uploads'

const WORKFLOW_INPUT_ROOT = path.join(config.dataDir, 'workflow-inputs')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function sanitizeFilename(name, fallback = 'file') {
  const base = path.posix.basename(String(name || '').replaceAll('\\', '/')).trim()
  const compact = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return compact || fallback
}

function buildUploadPath(originalName) {
  const safeName = sanitizeFilename(originalName)
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return safeRelPath(`${stamp}-${safeName}`)
}

function normalizeUploadRefs(uploadedFiles) {
  const list = Array.isArray(uploadedFiles) ? uploadedFiles : []
  const out = []
  const seen = new Set()
  for (const item of list) {
    let relPath = ''
    try {
      relPath = safeRelPath(String(item?.path || '').trim())
    } catch (_) {
      relPath = ''
    }
    if (!relPath) continue
    if (seen.has(relPath)) continue
    seen.add(relPath)
    out.push({
      path: relPath,
      name: String(item?.name || '').trim() || path.posix.basename(relPath),
    })
  }
  return out
}

function resolveInputRoot(userId, uploadId) {
  const userPart = encodeURIComponent(String(userId || '').trim())
  const uploadPart = encodeURIComponent(String(uploadId || '').trim())
  return path.join(WORKFLOW_INPUT_ROOT, userPart, uploadPart)
}

export function saveWorkflowInputUploads({ userId, files }) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) {
    throw new Error('files is required')
  }
  const uploadId = `wfu_${crypto.randomUUID()}`
  const inputRoot = resolveInputRoot(userId, uploadId)
  const filesDir = path.join(inputRoot, 'files')
  ensureDir(filesDir)

  const uploaded = []
  for (const file of list) {
    const relPath = buildUploadPath(file?.originalname || 'file')
    const absPath = path.join(filesDir, relPath.replaceAll('/', path.sep))
    ensureDir(path.dirname(absPath))
    fs.writeFileSync(absPath, file.buffer)
    uploaded.push({
      path: relPath,
      name: String(file?.originalname || path.basename(relPath)),
      size: Number(file?.size || 0),
      mimeType: String(file?.mimetype || ''),
    })
  }

  return { uploadId, uploaded }
}

function readWorkflowInputUploadBuffer({ userId, uploadId, relPath }) {
  const inputRoot = resolveInputRoot(userId, uploadId)
  const safePath = safeRelPath(relPath)
  const absPath = path.join(inputRoot, 'files', safePath.replaceAll('/', path.sep))
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw new Error(`workflow input file not found: ${safePath}`)
  }
  return fs.readFileSync(absPath)
}

function writeTextDeliverableToReceived({ runId, toAgentId, text }) {
  const relPath = resolveWorkflowReceivedRelPath(runId, START_INPUT_SOURCE_ALIAS, path.posix.join('text', 'user-input.txt'))
  const abs = path.posix.join(config.receivedDirInContainer, relPath)
  const destDir = path.posix.dirname(abs)
  const filename = path.posix.basename(abs)
  const content = String(text || '')
  return writeFileToContainer(containerNameFor(toAgentId), destDir, filename, content)
    .then(() => relPath)
}

async function writeUploadDeliverablesToReceived({
  runId,
  userId,
  toAgentId,
  uploadId,
  uploadedFiles,
}) {
  const delivered = []
  const failed = []
  for (const item of normalizeUploadRefs(uploadedFiles)) {
    try {
      const fileBuffer = readWorkflowInputUploadBuffer({
        userId,
        uploadId,
        relPath: item.path,
      })
      const relPath = resolveWorkflowReceivedRelPath(
        runId,
        START_INPUT_SOURCE_ALIAS,
        path.posix.join('uploads', item.path)
      )
      const abs = path.posix.join(config.receivedDirInContainer, relPath)
      await writeFileToContainer(
        containerNameFor(toAgentId),
        path.posix.dirname(abs),
        path.posix.basename(abs),
        fileBuffer
      )
      delivered.push(relPath)
    } catch (err) {
      failed.push({
        path: item.path,
        error: err?.message || String(err),
      })
    }
  }
  return { delivered, failed }
}

export async function deliverWorkflowStartInputsToAgent({
  runId,
  userId,
  toAgentId,
  startInput,
  requestedFiles,
}) {
  const wanted = new Set((Array.isArray(requestedFiles) ? requestedFiles : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))
  const useText = wanted.has(START_TEXT_DELIVERABLE) || wanted.has(LEGACY_TEXT_DELIVERABLE)
  const useUploads = wanted.has(START_UPLOADS_DELIVERABLE) || wanted.has(LEGACY_UPLOADS_DELIVERABLE)

  const delivered = []
  const failed = []
  const payload = startInput && typeof startInput === 'object' ? startInput : {}
  const containerName = containerNameFor(toAgentId)
  await ensureContainerRunning(containerName)

  if (useText) {
    try {
      const rel = await writeTextDeliverableToReceived({
        runId,
        toAgentId,
        text: String(payload.text || ''),
      })
      delivered.push(rel)
    } catch (err) {
      failed.push({
        path: START_TEXT_DELIVERABLE,
        error: err?.message || String(err),
      })
    }
  }

  if (useUploads) {
    const uploadId = String(payload.uploadId || '').trim()
    if (!uploadId) {
      failed.push({
        path: START_UPLOADS_DELIVERABLE,
        error: 'uploadId is required for uploaded files deliverable',
      })
    } else {
      const uploadResult = await writeUploadDeliverablesToReceived({
        runId,
        userId,
        toAgentId,
        uploadId,
        uploadedFiles: payload.uploadedFiles,
      })
      delivered.push(...uploadResult.delivered)
      failed.push(...uploadResult.failed)
    }
  }

  return { delivered, failed }
}
