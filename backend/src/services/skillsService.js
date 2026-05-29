import fs from 'node:fs'
import path from 'node:path'
import tar from 'tar-stream'
import {
  ensureAgentRuntime,
  getSkillsInstallRoot,
  newId,
  nowTs,
  readSkillsList,
  writeSkillsList,
} from './agentExtensionsStore.js'
import { execInContainer, findContainer } from './hermes.js'
import { readHermesConfig, writeHermesConfigRaw } from './promptFile.js'

function normalizeName(value, fallback = '未命名 Skill') {
  const text = String(value || '').trim()
  return text || fallback
}

function normalizeType(value) {
  const type = String(value || '').trim().toLowerCase()
  if (!['local', 'git'].includes(type)) {
    throw new Error('invalid sourceType, expected local/git')
  }
  return type
}

function toPublic(item) {
  return {
    id: item.id,
    name: item.name,
    sourceType: item.sourceType,
    source: item.source || '',
    installDir: item.installDir,
    status: item.status,
    publishedSkills: Array.isArray(item.publishedSkills) ? item.publishedSkills : [],
    lastError: item.lastError || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    installedAt: item.installedAt || null,
  }
}

function yamlScalar(value) {
  const s = String(value ?? '')
  if (/^[A-Za-z0-9._:/\-]+$/.test(s)) return s
  return JSON.stringify(s)
}

function stripTopLevelBlock(content, key) {
  const lines = String(content || '').split('\n')
  const out = []
  let skipping = false
  const targetRegex = new RegExp(`^${key}:\\s*(#.*)?$`)
  const topLevelKeyRegex = /^[^\s#][^:]*:\s*(#.*)?$/
  for (const line of lines) {
    if (!skipping && targetRegex.test(line.trim())) {
      skipping = true
      continue
    }
    if (skipping) {
      if (topLevelKeyRegex.test(line)) {
        skipping = false
      } else {
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

function buildMultiagentSkillsBlock(items) {
  const installed = Array.isArray(items)
    ? items.filter((item) => item?.status === 'installed')
    : []
  if (!installed.length) return ''

  const skills = []
  for (const item of installed) {
    const list = Array.isArray(item?.publishedSkills) ? item.publishedSkills : []
    for (const skill of list) {
      const category = String(skill?.category || '').trim()
      const name = String(skill?.name || '').trim()
      if (category && name) {
        skills.push(`${category}/${name}`)
      } else if (name) {
        skills.push(name)
      }
    }
  }
  const deduped = [...new Set(skills)].sort((a, b) => a.localeCompare(b))
  if (!deduped.length) return ''

  const lines = [
    'multiagent_skills:',
    `  generated_at: ${Date.now()}`,
    '  installed:',
  ]
  for (const skillName of deduped) {
    lines.push(`    - ${yamlScalar(skillName)}`)
  }
  return `${lines.join('\n')}\n`
}

async function syncSkillsManifestToHermesConfig(agentId, list) {
  let existing = ''
  try {
    existing = await readHermesConfig(agentId)
  } catch (_) {
    existing = ''
  }
  const contentWithoutBlock = stripTopLevelBlock(existing, 'multiagent_skills').trimEnd()
  const nextBlock = buildMultiagentSkillsBlock(list)
  const merged = nextBlock
    ? `${contentWithoutBlock}${contentWithoutBlock ? '\n\n' : ''}${nextBlock}`.replace(/\n*$/, '\n')
    : `${contentWithoutBlock}\n`
  await writeHermesConfigRaw(agentId, merged)
}

function defaultCategoryFromSource(source) {
  const text = String(source || '').trim()
  if (!text) return 'custom'
  const tail = text.split('/').filter(Boolean).pop() || 'custom'
  return tail.replace(/\.git$/i, '').replace(/[^A-Za-z0-9._-]/g, '-') || 'custom'
}

async function publishInstalledSkills(containerName, installDir, fallbackCategory) {
  const script = `
import json
import os
import shutil
import sys

install_dir = sys.argv[1] if len(sys.argv) > 1 else ""
skills_root = "/opt/data/skills"
fallback_category = (sys.argv[2] if len(sys.argv) > 2 else "custom") or "custom"
published = []

def publish(skill_dir, category, name):
    dst = os.path.join(skills_root, category, name)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(skill_dir, dst)
    published.append({"name": name, "category": category, "path": dst})

for root, _dirs, files in os.walk(install_dir):
    if "SKILL.md" not in files:
        continue
    skill_dir = root
    rel = os.path.relpath(skill_dir, install_dir)
    parts = [] if rel == "." else rel.split(os.sep)
    category = fallback_category
    if "skills" in parts:
        idx = parts.index("skills")
        if idx > 0:
            category = parts[idx - 1]
    name = os.path.basename(skill_dir)
    publish(skill_dir, category, name)

print(json.dumps(published, ensure_ascii=False))
`
  const result = await execInContainer(containerName, [
    'python3',
    '-c',
    script,
    installDir,
    fallbackCategory || 'custom',
  ])
  const text = String(result?.stdout || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

async function addFileToPack(pack, absFilePath, relPath) {
  const content = await fs.promises.readFile(absFilePath)
  await new Promise((resolve, reject) => {
    pack.entry({ name: relPath, type: 'file', mode: 0o644 }, content, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function addDirectoryToPack(pack, absDirPath, relDirPath = '') {
  const entries = await fs.promises.readdir(absDirPath, { withFileTypes: true })
  for (const entry of entries) {
    const absPath = path.join(absDirPath, entry.name)
    const relPath = relDirPath ? `${relDirPath}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await new Promise((resolve, reject) => {
        pack.entry({ name: relPath, type: 'directory', mode: 0o755 }, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      await addDirectoryToPack(pack, absPath, relPath)
    } else if (entry.isFile()) {
      await addFileToPack(pack, absPath, relPath)
    }
  }
}

async function uploadLocalDirectoryToContainer({ container, localPath, containerPath }) {
  const stat = await fs.promises.stat(localPath).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error('localPath must be an existing directory')
  }
  const pack = tar.pack()
  // putArchive must start reading before tar entry callbacks can drain.
  // Otherwise addDirectoryToPack may block forever on pack.entry callback.
  const uploadPromise = container.putArchive(pack, { path: containerPath })
  await addDirectoryToPack(pack, localPath)
  pack.finalize()
  await uploadPromise
}

async function ensureContainerObject(agentId) {
  const { containerName } = await ensureAgentRuntime(agentId)
  const container = await findContainer(containerName)
  if (!container) throw new Error(`container ${containerName} not found`)
  return { container, containerName }
}

export async function listSkills(agentId) {
  const list = await readSkillsList(agentId)
  const installingTimeoutMs = 5 * 60 * 1000
  let changedByTimeout = false
  for (const item of list) {
    if (item?.status !== 'installing') continue
    const updatedAt = Number(item.updatedAt || item.createdAt || 0)
    if (!updatedAt) continue
    if (Date.now() - updatedAt <= installingTimeoutMs) continue
    item.status = 'failed'
    item.lastError = item.lastError || 'installation timed out'
    item.updatedAt = nowTs()
    changedByTimeout = true
  }
  if (changedByTimeout) {
    await writeSkillsList(agentId, list)
  }

  const needRepair = list.some(
    (item) =>
      item?.status === 'installed' &&
      (!Array.isArray(item.publishedSkills) || item.publishedSkills.length === 0)
  )
  if (needRepair) {
    try {
      const { containerName } = await ensureContainerObject(agentId)
      let changed = false
      for (const item of list) {
        if (
          item?.status !== 'installed' ||
          (Array.isArray(item.publishedSkills) && item.publishedSkills.length > 0)
        ) continue
        const published = await publishInstalledSkills(
          containerName,
          item.installDir,
          defaultCategoryFromSource(item.source)
        )
        if (published.length > 0) {
          item.publishedSkills = published
          item.updatedAt = nowTs()
          item.lastError = ''
          changed = true
        }
      }
      if (changed) await writeSkillsList(agentId, list)
    } catch (_) {
      // 忽略修复失败，避免影响列表读取
    }
  }
  await syncSkillsManifestToHermesConfig(agentId, list)
  return list.map(toPublic)
}

export async function installSkill(agentId, body) {
  const sourceType = normalizeType(body?.sourceType)
  const source = String(body?.source || '').trim()
  if (!source) throw new Error('source is required')
  const name = normalizeName(body?.name, sourceType === 'git' ? 'Git Skill' : '本地 Skill')
  const id = newId()
  const ts = nowTs()
  const installDir = `${getSkillsInstallRoot()}/${id}`
  const { container, containerName } = await ensureContainerObject(agentId)
  await execInContainer(containerName, ['mkdir', '-p', getSkillsInstallRoot()])

  const entry = {
    id,
    name,
    sourceType,
    source,
    installDir,
    status: 'installing',
    publishedSkills: [],
    lastError: '',
    createdAt: ts,
    updatedAt: ts,
    installedAt: null,
  }
  const list = await readSkillsList(agentId)
  list.push(entry)
  await writeSkillsList(agentId, list)
  await syncSkillsManifestToHermesConfig(agentId, list)

  try {
    if (sourceType === 'git') {
      const ref = String(body?.ref || '').trim()
      const base = `rm -rf ${JSON.stringify(installDir)} && mkdir -p ${JSON.stringify(installDir)} && git clone ${JSON.stringify(source)} ${JSON.stringify(installDir)}`
      const command = ref
        ? `${base} && cd ${JSON.stringify(installDir)} && git checkout ${JSON.stringify(ref)}`
        : base
      await execInContainer(containerName, ['bash', '-lc', command])
    } else {
      await execInContainer(containerName, ['mkdir', '-p', installDir])
      await uploadLocalDirectoryToContainer({
        container,
        localPath: source,
        containerPath: installDir,
      })
    }
    const published = await publishInstalledSkills(
      containerName,
      installDir,
      defaultCategoryFromSource(source)
    )
    if (published.length === 0) {
      throw new Error('no valid SKILL.md found after install')
    }
    entry.publishedSkills = published
    entry.status = 'installed'
    entry.lastError = ''
    entry.installedAt = nowTs()
  } catch (err) {
    entry.status = 'failed'
    entry.lastError = err?.message || String(err)
    entry.updatedAt = nowTs()
    const failedList = await readSkillsList(agentId)
    const failedIndex = failedList.findIndex((item) => item.id === id)
    if (failedIndex >= 0) {
      failedList[failedIndex] = entry
      await writeSkillsList(agentId, failedList)
      await syncSkillsManifestToHermesConfig(agentId, failedList)
    }
    throw err
  }

  entry.updatedAt = nowTs()
  const successList = await readSkillsList(agentId)
  const successIndex = successList.findIndex((item) => item.id === id)
  if (successIndex >= 0) {
    successList[successIndex] = entry
    await writeSkillsList(agentId, successList)
    await syncSkillsManifestToHermesConfig(agentId, successList)
  }
  return toPublic(entry)
}

export async function deleteSkill(agentId, skillId) {
  const list = await readSkillsList(agentId)
  const index = list.findIndex((item) => item.id === skillId)
  if (index < 0) return false
  const [entry] = list.splice(index, 1)
  await writeSkillsList(agentId, list)
  await syncSkillsManifestToHermesConfig(agentId, list)
  const { containerName } = await ensureContainerObject(agentId)
  if (Array.isArray(entry.publishedSkills)) {
    for (const skill of entry.publishedSkills) {
      if (!skill?.path) continue
      await execInContainer(containerName, ['bash', '-lc', `rm -rf ${JSON.stringify(skill.path)}`]).catch(() => {})
    }
  }
  await execInContainer(containerName, ['bash', '-lc', `rm -rf ${JSON.stringify(entry.installDir)}`]).catch(() => {})
  return true
}
