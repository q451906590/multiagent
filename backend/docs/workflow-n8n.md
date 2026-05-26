# Workflow + n8n 运维说明

## 必需环境变量

在 `backend/.env` 配置以下项：

- `N8N_BASE_URL`: n8n API 地址，例如 `http://localhost:5678`
- `N8N_API_KEY`: n8n API Key（请求头 `X-N8N-API-KEY`）
- `N8N_WEBHOOK_SECRET`: n8n 回调与 Agent 节点回调共享密钥

可选：

- `N8N_WEBHOOK_BASE_URL`: 通过 webhook 触发流程时的基础地址
- `BACKEND_PUBLIC_BASE_URL`: n8n 能访问到的后端地址（用于 Agent 节点 HTTP 回调）

## 上线步骤

1. 启动后端与 n8n，确认 `N8N_BASE_URL` 可达。
2. 在前端进入“搭建工作流”，创建流程并保存。
3. 点击“发布”，后端会同步 workflow 到 n8n。
4. 点击“激活”，后端会调用 n8n 激活流程。
5. 点击“运行工作流”，后端触发 n8n 并写入 `workflow_runs`。

## 故障排查

- 发布失败：
  - 检查 `N8N_BASE_URL`、`N8N_API_KEY` 是否正确。
  - 检查 n8n 是否启用 API 功能。
- 运行失败：
  - 检查 workflow 是否已经发布并激活。
  - 查看 `workflow_run_events` 中 `run_failed` 事件及错误消息。
- 回调失败：
  - 确认 `N8N_WEBHOOK_SECRET` 一致。
  - 确认 n8n 能访问 `BACKEND_PUBLIC_BASE_URL/api/workflows/webhooks/*`。
