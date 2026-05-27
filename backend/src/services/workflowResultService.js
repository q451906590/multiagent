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
import { resolveResultNodeExecutionPlan } from './workflowService.js'

function normalizeRelPath(inputPath) {
  const raw = String(inputPath || '').trim().replaceAll('\\', '/')
  if (!raw || raw.startsWith('/') || raw.includes('\0')) return ''
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length) return ''
  if (parts.some((part) => part === '.' || part === '..')) return ''
  return parts.join('/')
}

async function readFileBufferFromAgentDeliverables(agentId, relPath) {
  const normalized = normalizeRelPath(relPath)
  if (!normalized) throw new Error('invalid deliverable path')
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)
  const absPath = path.posix.join(config.deliveryDirInContainer, normalized)
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
  const cmd = [
    `TARGET=${JSON.stringify(absPath)} /opt/hermes/.venv/bin/python - <<'PY'`,
    py,
    'PY',
  ].join('\n')
  const result = await execInContainer(containerName, ['bash', '-lc', cmd])
  if ((result?.exitCode ?? 0) !== 0) {
    throw new Error(`deliverable not found: ${normalized}`)
  }
  const encoded = String(result?.stdout || '').trim()
  if (!encoded) throw new Error(`deliverable not found: ${normalized}`)
  return Buffer.from(encoded, 'base64')
}

export async function buildResultArchive({
  workflowId,
  userId,
  runId,
  nodeId,
}) {
  const plan = resolveResultNodeExecutionPlan({ workflowId, userId, nodeId })
  const zip = new JSZip()
  const included = []
  const missing = []

  for (const ref of plan.resultDeliverables) {
    try {
      const buffer = await readFileBufferFromAgentDeliverables(ref.sourceAgentId, ref.path)
      const folder = String(ref.sourceNodeLabel || ref.sourceNodeId || ref.sourceAgentId || 'agent')
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

  const run = getWorkflowRunById(runId, userId)
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
