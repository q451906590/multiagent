import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

function envInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  backendRoot,
  dataDir: path.join(backendRoot, 'data'),
  cacheDir: path.join(backendRoot, '.cache'),
  hermesRepoDir: path.join(backendRoot, '.cache', 'hermes-agent'),
  dbPath: path.join(backendRoot, 'data', 'agents.db'),
  envFilePath: path.join(backendRoot, '.env'),

  port: envInt('PORT', 8080),

  hermesImageTag: process.env.HERMES_IMAGE_TAG || 'nousresearch/hermes-agent:latest',
  hermesRepoUrl: process.env.HERMES_REPO_URL || 'https://github.com/NousResearch/hermes-agent',
  hermesRepoRef: process.env.HERMES_REPO_REF || 'main',

  hermesProvider: process.env.HERMES_PROVIDER || 'minimax-cn',
  hermesDefaultModel: process.env.HERMES_DEFAULT_MODEL || 'MiniMax-M2.7',

  chatTimeoutMs: envInt('CHAT_TIMEOUT_MS', 600_000),
  delegationKeyDefaultTtlMs: envInt('DELEGATION_KEY_DEFAULT_TTL_MS', 30 * 24 * 60 * 60 * 1000),
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  dockerSocket: process.env.DOCKER_SOCKET || '',

  containerNamePrefix: 'multiagent-',
  volumeNamePrefix: 'hermes-data-',
  hermesHomeInContainer: '/opt/data',
  hostMountDirInContainer: process.env.HOST_MOUNT_DIR_IN_CONTAINER || '/opt/data/host-mount',
  uploadInboxDirInContainer: process.env.UPLOAD_INBOX_DIR_IN_CONTAINER || '/opt/data/inbox',
  deliveryDirInContainer: process.env.DELIVERY_DIR_IN_CONTAINER || '/opt/data/deliverables',
  receivedDirInContainer: process.env.RECEIVED_DIR_IN_CONTAINER || '/opt/data/received',
}
