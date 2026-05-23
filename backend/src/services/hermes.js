import { spawn } from 'node:child_process'
import path from 'node:path'
import tar from 'tar-stream'
import Docker from 'dockerode'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

let docker = null
let imageEnsuredPromise = null
const imageBuildState = {
  inProgress: false,
  startedAt: null,
  lastSuccessAt: null,
  lastError: null,
}

export class ImageBuildInProgressError extends Error {
  constructor() {
    super('hermes image build already in progress')
    this.name = 'ImageBuildInProgressError'
    this.code = 'IMAGE_BUILD_IN_PROGRESS'
  }
}

export function getDocker() {
  if (docker) return docker
  if (config.dockerSocket) {
    if (config.dockerSocket.startsWith('//./pipe/') || config.dockerSocket.startsWith('\\\\.\\pipe\\')) {
      docker = new Docker({ socketPath: config.dockerSocket })
    } else {
      docker = new Docker({ socketPath: config.dockerSocket })
    }
  } else if (process.platform === 'win32') {
    docker = new Docker({ socketPath: '//./pipe/docker_engine' })
  } else {
    docker = new Docker({ socketPath: '/var/run/docker.sock' })
  }
  return docker
}

export async function pingDocker() {
  try {
    await getDocker().ping()
    return true
  } catch (err) {
    logger.error('docker ping failed:', err?.message || err)
    return false
  }
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd,
      shell: false,
      env: { ...process.env, ...(opts.env || {}) },
    })
    let stdout = ''
    let stderr = ''
    if (!opts.inherit) {
      child.stdout?.on('data', (d) => {
        stdout += d.toString()
        if (opts.onStdout) opts.onStdout(d.toString())
      })
      child.stderr?.on('data', (d) => {
        stderr += d.toString()
        if (opts.onStderr) opts.onStderr(d.toString())
      })
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr || stdout}`))
    })
  })
}

async function imageExists(tag) {
  try {
    const img = getDocker().getImage(tag)
    await img.inspect()
    return true
  } catch (err) {
    if (err?.statusCode === 404) return false
    throw err
  }
}

async function dockerPull({ onLog } = {}) {
  onLog?.(`docker pull ${config.hermesImageTag}\n`)
  await runCmd(
    'docker',
    ['pull', config.hermesImageTag],
    {
      onStdout: (s) => onLog?.(s),
      onStderr: (s) => onLog?.(s),
    }
  )
  onLog?.('image pull done.\n')
}

export function getHermesImageBuildState() {
  return { ...imageBuildState }
}

export async function ensureHermesImage({ onLog, waitIfBuilding = true } = {}) {
  if (imageEnsuredPromise) {
    if (!waitIfBuilding) throw new ImageBuildInProgressError()
    return imageEnsuredPromise
  }
  imageEnsuredPromise = (async () => {
    imageBuildState.inProgress = true
    imageBuildState.startedAt = Date.now()
    imageBuildState.lastError = null

    if (await imageExists(config.hermesImageTag)) {
      onLog?.(`image ${config.hermesImageTag} already exists, skip build.\n`)
      imageBuildState.lastSuccessAt = Date.now()
      imageBuildState.inProgress = false
      return
    }
    await dockerPull({ onLog })
    imageBuildState.lastSuccessAt = Date.now()
    imageBuildState.inProgress = false
  })().catch((err) => {
    imageBuildState.inProgress = false
    imageBuildState.lastError = {
      message: err?.message || String(err),
      ts: Date.now(),
    }
    imageEnsuredPromise = null
    throw err
  }).finally(() => {
    imageEnsuredPromise = null
  })
  return imageEnsuredPromise
}

export function containerNameFor(agentId) {
  return `${config.containerNamePrefix}${agentId}`
}

export function volumeNameFor(agentId) {
  return `${config.volumeNamePrefix}${agentId}`
}

export async function ensureVolume(name) {
  const d = getDocker()
  try {
    await d.getVolume(name).inspect()
    return
  } catch (err) {
    if (err?.statusCode !== 404) throw err
  }
  await d.createVolume({ Name: name })
}

export async function findContainer(name) {
  const d = getDocker()
  const list = await d.listContainers({ all: true, filters: { name: [`^/${name}$`] } })
  if (!list || list.length === 0) return null
  return d.getContainer(list[0].Id)
}

async function ensureContainerRunning(containerName) {
  const c = await findContainer(containerName)
  if (!c) {
    throw new Error(`container ${containerName} not found`)
  }
  const info = await c.inspect()
  if (!info.State?.Running) {
    await c.start()
  }
  return c
}

function buildEnvArray() {
  const wanted = [
    'HERMES_PROVIDER',
    'HERMES_DEFAULT_MODEL',
    'MINIMAX_CN_API_KEY',
    'MINIMAX_CN_BASE_URL',
    'MINIMAX_API_KEY',
    'MINIMAX_BASE_URL',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'GLM_API_KEY',
    'KIMI_API_KEY',
    'KIMI_CN_API_KEY',
    'DASHSCOPE_API_KEY',
    'DASHSCOPE_BASE_URL',
    'XIAOMI_API_KEY',
    'XIAOMI_BASE_URL',
  ]
  const out = []
  for (const k of wanted) {
    const v = process.env[k]
    if (v !== undefined && v !== '') out.push(`${k}=${v}`)
  }
  return out
}

export async function createAgentContainer({ agentId }) {
  const d = getDocker()
  const name = containerNameFor(agentId)
  const volume = volumeNameFor(agentId)

  await ensureVolume(volume)

  const env = buildEnvArray()

  const container = await d.createContainer({
    name,
    Image: config.hermesImageTag,
    Tty: false,
    OpenStdin: false,
    Cmd: ['tail', '-f', '/dev/null'],
    Env: env,
    HostConfig: {
      Binds: [`${volume}:${config.hermesHomeInContainer}`],
      RestartPolicy: { Name: 'unless-stopped' },
    },
  })
  await container.start()
  return container
}

export async function startContainer(name) {
  const c = await findContainer(name)
  if (!c) return { status: 'missing' }
  const info = await c.inspect()
  if (info.State?.Running) return { status: 'running', containerId: info.Id }
  await c.start()
  return { status: 'started', containerId: info.Id }
}

export async function stopAndRemoveContainer(name) {
  const c = await findContainer(name)
  if (!c) return false
  try {
    const info = await c.inspect()
    if (info.State?.Running) {
      await c.stop({ t: 5 }).catch(() => {})
    }
  } catch (_) { /* noop */ }
  try {
    await c.remove({ force: true })
  } catch (err) {
    if (err?.statusCode !== 404) throw err
  }
  return true
}

export async function removeVolume(name) {
  try {
    await getDocker().getVolume(name).remove()
    return true
  } catch (err) {
    if (err?.statusCode === 404) return false
    throw err
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

export async function execInContainer(containerName, cmd, { stdin, onStdout, onStderr } = {}) {
  const c = await findContainer(containerName)
  if (!c) throw new Error(`container ${containerName} not found`)
  const exec = await c.exec({
    Cmd: cmd,
    AttachStdin: !!stdin,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  })
  const stream = await exec.start({ hijack: true, stdin: !!stdin })

  let outBuf = ''
  let errBuf = ''
  const stdoutWritable = {
    write(chunk) {
      const s = chunk.toString('utf8')
      outBuf += s
      onStdout?.(s)
    },
  }
  const stderrWritable = {
    write(chunk) {
      const s = chunk.toString('utf8')
      errBuf += s
      onStderr?.(s)
    },
  }
  c.modem.demuxStream(stream, stdoutWritable, stderrWritable)

  if (stdin) {
    stream.write(stdin)
    stream.end()
  }

  await new Promise((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  const inspect = await exec.inspect()
  return { exitCode: inspect.ExitCode ?? 0, stdout: outBuf, stderr: errBuf }
}

export async function execStreaming(containerName, cmd, { stdin, onStdout, onStderr, signal } = {}) {
  const c = await findContainer(containerName)
  if (!c) throw new Error(`container ${containerName} not found`)
  const exec = await c.exec({
    Cmd: cmd,
    AttachStdin: !!stdin,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  })
  const stream = await exec.start({ hijack: true, stdin: !!stdin })

  const stdoutWritable = {
    write(chunk) {
      onStdout?.(chunk.toString('utf8'))
    },
  }
  const stderrWritable = {
    write(chunk) {
      onStderr?.(chunk.toString('utf8'))
    },
  }
  c.modem.demuxStream(stream, stdoutWritable, stderrWritable)

  if (stdin) {
    stream.write(stdin)
    stream.end()
  }

  if (signal) {
    if (signal.aborted) {
      try { stream.destroy?.() } catch (_) {}
    } else {
      signal.addEventListener('abort', () => {
        try { stream.destroy?.() } catch (_) {}
      })
    }
  }

  await new Promise((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('close', resolve)
    stream.on('error', reject)
  })

  const inspect = await exec.inspect().catch(() => ({}))
  return { exitCode: inspect.ExitCode ?? 0 }
}

function tarOneFile(filename, content) {
  const pack = tar.pack()
  pack.entry({ name: filename, mode: 0o644, type: 'file' }, content)
  pack.finalize()
  return pack
}

export async function writeFileToContainer(containerName, destDir, filename, content) {
  const c = await findContainer(containerName)
  if (!c) throw new Error(`container ${containerName} not found`)
  await execInContainer(containerName, ['mkdir', '-p', destDir])
  const pack = tarOneFile(filename, content)
  await c.putArchive(pack, { path: destDir })
}

export function safeRelPath(inputPath) {
  const raw = String(inputPath || '').trim().replaceAll('\\', '/')
  if (!raw) throw new Error('invalid path: empty')
  if (raw.includes('\0')) throw new Error('invalid path: contains null byte')
  if (raw.startsWith('/')) throw new Error('invalid path: absolute path is not allowed')

  const normalized = path.posix.normalize(raw)
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('invalid path: path traversal is not allowed')
  }
  return normalized
}

function parseFileListJson(stdout) {
  const text = String(stdout || '').trim()
  if (!text) return []
  let arr = []
  try {
    arr = JSON.parse(text)
  } catch (_) {
    throw new Error('failed to parse file list output')
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x) => x && typeof x.path === 'string')
    .map((x) => ({
      path: safeRelPath(x.path),
      size: Number.isFinite(Number(x.size)) ? Number(x.size) : 0,
      mtime: Number.isFinite(Number(x.mtime)) ? Number(x.mtime) : 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function listAgentFiles(agentId, { maxFiles = 1000, rootDir } = {}) {
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)
  const root = String(rootDir || config.deliveryDirInContainer)
  const script = [
    'import json, os',
    'root = os.environ.get("ROOT", "/opt/data")',
    'limit = int(os.environ.get("LIMIT", "1000"))',
    'items = []',
    'for base, _dirs, files in os.walk(root):',
    '  for filename in files:',
    '    abs_path = os.path.join(base, filename)',
    '    try:',
    '      stat = os.stat(abs_path)',
    '    except OSError:',
    '      continue',
    '    rel = os.path.relpath(abs_path, root).replace(os.sep, "/")',
    '    items.append({\"path\": rel, \"size\": int(stat.st_size), \"mtime\": int(stat.st_mtime)})',
    '    if len(items) >= limit:',
    '      print(json.dumps(items, ensure_ascii=False))',
    '      sys.exit(0)',
    'print(json.dumps(items, ensure_ascii=False))',
  ].join('\n')

  const pythonCmd = [
    `ROOT=${JSON.stringify(root)} LIMIT=${JSON.stringify(String(maxFiles))} /opt/hermes/.venv/bin/python - <<'PY'`,
    script,
    'PY',
  ].join('\n')
  const result = await execInContainer(containerName, ['bash', '-lc', pythonCmd])
  if ((result?.exitCode ?? 0) !== 0) {
    const stderrMsg = String(result?.stderr || '').trim()
    throw new Error(stderrMsg || `list agent files failed with exit code ${result?.exitCode}`)
  }
  return parseFileListJson(result.stdout)
}

function archiveToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

export async function copyFilesBetweenAgents({ fromAgentId, toAgentId, paths }) {
  const sourceName = containerNameFor(fromAgentId)
  const targetName = containerNameFor(toAgentId)
  await ensureContainerRunning(sourceName)
  await ensureContainerRunning(targetName)

  const sourceContainer = await findContainer(sourceName)
  const targetContainer = await findContainer(targetName)
  if (!sourceContainer || !targetContainer) {
    throw new Error('source or target container not found')
  }

  const inputPaths = Array.isArray(paths) ? paths : []
  const normalizedPaths = [...new Set(inputPaths.map((p) => safeRelPath(p)))]
  const delivered = []
  const failed = []

  for (const relPath of normalizedPaths) {
    const sourceAbs = path.posix.join(config.deliveryDirInContainer, relPath)
    const targetRelPath = safeRelPath(path.posix.join(fromAgentId, relPath))
    const targetDir = path.posix.join(config.receivedDirInContainer, path.posix.dirname(targetRelPath))
    try {
      await execInContainer(targetName, ['mkdir', '-p', targetDir])
      const archiveStream = await sourceContainer.getArchive({ path: sourceAbs })
      const archiveBuffer = await archiveToBuffer(archiveStream)
      await targetContainer.putArchive(archiveBuffer, { path: targetDir })
      delivered.push(targetRelPath)
    } catch (err) {
      failed.push({ path: relPath, error: err?.message || String(err) })
    }
  }

  return { delivered, failed }
}

export async function deleteAgentFileByScope({ agentId, scope = 'delivery', relPath }) {
  const normalizedRelPath = safeRelPath(relPath)
  const containerName = containerNameFor(agentId)
  await ensureContainerRunning(containerName)

  const rootDir = scope === 'received' ? config.receivedDirInContainer : config.deliveryDirInContainer
  const script = [
    'import os',
    'root = os.environ.get("ROOT", "")',
    'rel = os.environ.get("REL", "")',
    'target = os.path.normpath(os.path.join(root, rel))',
    'if os.path.isfile(target):',
    '  os.remove(target)',
    '  print("deleted")',
    'else:',
    '  print("missing")',
  ].join('\n')
  const pythonCmd = [
    `ROOT=${JSON.stringify(rootDir)} REL=${JSON.stringify(normalizedRelPath)} /opt/hermes/.venv/bin/python - <<'PY'`,
    script,
    'PY',
  ].join('\n')
  const result = await execInContainer(containerName, ['bash', '-lc', pythonCmd])
  if ((result?.exitCode ?? 0) !== 0) {
    const stderrMsg = String(result?.stderr || '').trim()
    throw new Error(stderrMsg || `delete file failed with exit code ${result?.exitCode}`)
  }

  const out = String(result?.stdout || '').trim().toLowerCase()
  return { deleted: out.includes('deleted'), path: normalizedRelPath }
}
