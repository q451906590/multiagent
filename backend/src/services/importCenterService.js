import { listImportedAgentsByUser, listImportedWorkflowsByUser, listMarketplaceTags } from '../db.js'

export function listImportCenterItems(userId) {
  const tagMap = new Map(listMarketplaceTags().map((tag) => [tag.id, tag]))
  return listImportedAgentsByUser(userId).map((item) => ({
    ...item,
    tags: (item.tagIds || [])
      .map((tagId) => tagMap.get(tagId))
      .filter(Boolean),
  }))
}

export function listImportCenterWorkflowItems(userId) {
  const tagMap = new Map(listMarketplaceTags().map((tag) => [tag.id, tag]))
  return listImportedWorkflowsByUser(userId).map((item) => ({
    ...item,
    tags: (item.tagIds || [])
      .map((tagId) => tagMap.get(tagId))
      .filter(Boolean),
  }))
}
