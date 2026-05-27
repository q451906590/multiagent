import { createRouter, createWebHashHistory } from 'vue-router'
import AgentWorkspacePage from '../views/AgentWorkspacePage.vue'
import AgentChatPage from '../views/AgentChatPage.vue'
import AgentExtensionsPage from '../views/AgentExtensionsPage.vue'
import AgentDelegationsPage from '../views/AgentDelegationsPage.vue'
import MarketplacePage from '../views/MarketplacePage.vue'
import MarketplaceDetailPage from '../views/MarketplaceDetailPage.vue'
import ImportCenterPage from '../views/ImportCenterPage.vue'
import DemoRoutePage from '../views/DemoRoutePage.vue'
import WorkflowListPage from '../views/workflow/WorkflowListPage.vue'
import WorkflowDetailPage from '../views/workflow/WorkflowDetailPage.vue'

const routes = [
  { path: '/', redirect: '/agents' },
  {
    path: '/agents',
    name: 'agents',
    component: AgentWorkspacePage,
    meta: { title: '调用工作台', navKey: 'list' },
  },
  {
    path: '/agents/:agentId/chat',
    name: 'agent-chat',
    component: AgentChatPage,
    meta: { title: 'Agent 对话', navKey: 'list' },
  },
  {
    path: '/agents/:agentId/extensions',
    name: 'agent-extensions',
    component: AgentExtensionsPage,
    meta: { title: '扩展管理', navKey: 'list' },
  },
  {
    path: '/agents/:agentId/delegations',
    name: 'agent-delegations',
    component: AgentDelegationsPage,
    meta: { title: '外派 AK 管理', navKey: 'list' },
  },
  {
    path: '/marketplace',
    name: 'marketplace',
    component: MarketplacePage,
    meta: { title: 'Agent 市场', navKey: 'marketplace' },
  },
  {
    path: '/marketplace/:templateId',
    name: 'marketplace-detail',
    component: MarketplaceDetailPage,
    meta: { title: '模板详情', navKey: 'marketplace' },
  },
  {
    path: '/import-center',
    name: 'import-center',
    component: ImportCenterPage,
    meta: { title: '导入中心', navKey: 'importCenter' },
  },
  {
    path: '/workflow',
    name: 'workflow-list',
    component: WorkflowListPage,
    meta: { title: '工作流管理', navKey: 'workflowBuilder' },
  },
  {
    path: '/workflow/:workflowId',
    name: 'workflow-detail',
    component: WorkflowDetailPage,
    meta: { title: '工作流详情', navKey: 'workflowBuilder' },
  },
  {
    path: '/demo/:menuKey',
    name: 'demo',
    component: DemoRoutePage,
    meta: { title: '功能演示', navKey: 'demo' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
