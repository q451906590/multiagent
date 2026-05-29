import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { config } from '../config.js'
import { getWorkflowRunById, updateWorkflowRun } from '../db.js'
import {
  containerNameFor,
  ensureContainerRunning,
  execInContainer,
} from './hermes.js'
import { START_TEXT_DELIVERABLE, START_UPLOADS_DELIVERABLE } from './workflowInputService.js'
import { resolveResultNodeExecutionPlan } from './workflowService.js'
import { resolveWorkflowDeliverablesDir } from './sessionPathService.js'

function normalizeRelPath(inputPath) {
  const raw = String(inputPath || '').trim().replaceAll('\\', '/')
  if (!raw || raw.startsWith('/') || raw.includes('\0')) return ''
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) return ''
  if (parts.some((part) => part === '.' || part === '..')) return ''
  return parts.join('/')
}

async function readFileBufferFromAgentDeliverables(agentId, runId, relPath) {
  const normalized = normalizeRelPath(relPath)
  if (!normalized) throw new Error('invalid deliverable path')
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)
  const baseDir = resolveWorkflowDeliverablesDir(runId, agentId)
  const fallbackBaseDir = config.deliveryDirInContainer
  const candidatePaths = [path.posix.join(baseDir, normalized)]
  if (fallbackBaseDir !== baseDir) {
    candidatePaths.push(path.posix.join(fallbackBaseDir, normalized))
  }
  const py = [
    'import base64, os, sys',
    'target = os.environ.get("TARGET", "")',
    'if not target or (not os.path.isfile(target)):',
    '  print("")',
    '  sys.exit(2)',
    'with open(target, "rb") as f:',
    '  data = f.read()',
    'print(base64.b64encode(data).decode("ascii"))',
  ].join('\n')
  for (const absPath of candidatePaths) {
    const cmd = [
      `TARGET=${JSON.stringify(absPath)} /opt/hermes/.venv/bin/python - <<'PY'`,
      py,
      'PY',
    ].join('\n')
    const result = await execInContainer(containerName, ['bash', '-lc', cmd])
    if ((result?.exitCode ?? 0) !== 0) {
      continue
    }
    const encoded = String(result?.stdout || '').trim()
    if (!encoded) continue
    return Buffer.from(encoded, 'base64')
  }
  throw new Error(`deliverable not found: ${normalized}`)
}

function normalizeStartInputPayload(run) {
  const input = run?.input && typeof run.input === 'object' ? run.input : {}
  const payload = input?.__workflowStartInput && typeof input.__workflowStartInput === 'object'
    ? input.__workflowStartInput
    : {}
  return {
    text: String(payload.text || ''),
    uploadId: String(payload.uploadId || '').trim(),
    uploadedFiles: Array.isArray(payload.uploadedFiles) ? payload.uploadedFiles : [],
  }
}

function normalizeStartUploadedFiles(input) {
  const list = Array.isArray(input) ? input : []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const rel = normalizeRelPath(item?.path)
    if (!rel || seen.has(rel)) continue
    seen.add(rel)
    out.push({
      path: rel,
      name: String(item?.name || '').trim() || path.posix.basename(rel),
    })
  }
  return out
}

function readWorkflowInputUploadBuffer({ userId, uploadId, relPath }) {
  const safeUploadId = String(uploadId || '').trim()
  const safeRel = normalizeRelPath(relPath)
  if (!safeUploadId || !safeRel) throw new Error('invalid workflow start upload path')
  const userPart = encodeURIComponent(String(userId || '').trim())
  const uploadPart = encodeURIComponent(safeUploadId)
  const absPath = path.join(
    config.dataDir,
    'workflow-inputs',
    userPart,
    uploadPart,
    'files',
    safeRel.replaceAll('/', path.sep)
  )
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw new Error(`workflow input file not found: ${safeRel}`)
  }
  return fs.readFileSync(absPath)
}

export async function buildResultArchive({
  workflowId,
  userId,
  runId,
  nodeId,
}) {
  const plan = resolveResultNodeExecutionPlan({ workflowId, userId, nodeId })
  const run = getWorkflowRunById(runId, userId)
  const startInput = normalizeStartInputPayload(run)
  const zip = new JSZip()
  const included = []
  const missing = []

  for (const ref of plan.resultDeliverables) {
    try {
      const folder = String(ref.sourceNodeLabel || ref.sourceNodeId || ref.sourceAgentId || 'agent')
      const sourceNodeType = String(ref.sourceNodeType || '').trim()
      if (sourceNodeType === 'start.userInput') {
        if (ref.path === START_TEXT_DELIVERABLE || ref.path === 'user-input.txt') {
          const entry = `${folder}/user-input.txt`
          zip.file(entry, Buffer.from(startInput.text || '', 'utf8'))
          included.push({
            sourceNodeId: ref.sourceNodeId,
            sourceAgentId: '',
            path: ref.path,
            entry,
          })
          continue
        }
        if (ref.path === START_UPLOADS_DELIVERABLE || ref.path === 'user-uploads') {
          const uploadItems = normalizeStartUploadedFiles(startInput.uploadedFiles)
          if (!uploadItems.length) {
            missing.push({
              sourceNodeId: ref.sourceNodeId,
              sourceAgentId: '',
              path: ref.path,
              reason: 'no_uploaded_files',
            })
            continue
          }
          for (const item of uploadItems) {
            const buffer = readWorkflowInputUploadBuffer({
              userId,
              uploadId: startInput.uploadId,
              relPath: item.path,
            })
            const entry = `${folder}/uploads/${item.path}`
            zip.file(entry, buffer)
            included.push({
              sourceNodeId: ref.sourceNodeId,
              sourceAgentId: '',
              path: item.path,
              entry,
            })
          }
          continue
        }
      }
      const buffer = await readFileBufferFromAgentDeliverables(ref.sourceAgentId, runId, ref.path)
      const entry = `${folder}/${ref.path}`
      zip.file(entry, buffer)
      included.push({
        sourceNodeId: ref.sourceNodeId,
        sourceAgentId: ref.sourceAgentId,
        path: ref.path,
        entry,
      })
    } catch (_) {
      missing.push({
        sourceNodeId: ref.sourceNodeId,
        sourceAgentId: ref.sourceAgentId,
        path: ref.path,
      })
    }
  }

  const archiveName = String(plan.archiveName || 'workflow-result.zip').trim() || 'workflow-result.zip'
  const safeName = archiveName.toLowerCase().endsWith('.zip') ? archiveName : `${archiveName}.zip`
  const outDir = path.join(config.dataDir, 'workflow-runs', runId)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, safeName)
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(outPath, zipBuffer)

  if (run) {
    const output = run.output && typeof run.output === 'object' ? { ...run.output } : {}
    output.resultArchive = {
      nodeId,
      archiveName: safeName,
      filePath: outPath,
      relativePath: path.relative(config.backendRoot, outPath).replaceAll('\\', '/'),
      downloadPath: `/api/workflow-runs/${encodeURIComponent(runId)}/result-archive`,
      includedCount: included.length,
      missingCount: missing.length,
      generatedAt: Date.now(),
    }
    output.resultMissing = missing
    updateWorkflowRun(runId, userId, { output })
  }

  return {
    plan,
    archiveName: safeName,
    filePath: outPath,
    included,
    missing,
    downloadPath: `/api/workflow-runs/${encodeURIComponent(runId)}/result-archive`,
  }
}
