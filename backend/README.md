# Multi-Agent Backend

为 [`frontend/vite-project`](../frontend/vite-project) 提供后端服务：每个 agent 都映射到一个独立的 [hermes-agent](https://github.com/NousResearch/hermes-agent) Docker 容器，长期记忆通过独立的 docker volume 在容器重启之间持久化。

## 技术栈

- Node.js (>= 20，使用 `node --watch` 与 ESM)
- Express 4
- better-sqlite3（agent 元数据持久化）
- dockerode（容器/镜像/卷的运行时管理）
- 单次 `docker exec`：每条聊天消息以非交互方式调用容器内 `hermes`，stdout 通过 SSE 增量推回前端

## 目录结构

```
backend/
  src/
    server.js              Express 入口
    config.js              .env 读取与常量
    db.js                  better-sqlite3 + 表结构
    routes/
      agents.js            /api/agents CRUD
      chat.js              /api/agents/:id/chat（SSE）
      system.js            /api/system/bootstrap & /api/system/health
    services/
      hermes.js            dockerode 封装：image/volume/container/exec
      promptFile.js        把 systemPrompt 落到容器内 ~/.hermes/AGENTS.md
    utils/
      sse.js, logger.js
  data/                    运行时生成（SQLite db）
  .cache/hermes-agent/     第一次启动时 git clone 到这里用于 docker build
  .env.example
  package.json
```

## 环境要求

- **Node.js >= 20**
- **Docker Desktop**（Windows 上请启用 WSL2 backend；hermes-agent 不支持原生 Windows）
- **git**（用于 clone hermes-agent 源码做镜像构建）
- **docker CLI**（在 PATH 中可用，构建镜像用 `docker build`）
- 一个可用的 LLM provider 凭证（见 `.env.example`）

## 启动顺序

```bash
cd backend
cp .env.example .env       # 然后编辑 .env，填好 provider + key
npm install
npm run dev                # 监听 http://localhost:8080
```

第二个终端启动前端：

```bash
cd frontend/vite-project
npm install
npm run dev                # http://localhost:5173
```

前端通过 Vite dev proxy 把 `/api/*` 转发到 `http://localhost:8080`，无需改前端 base URL。

## 首次运行会发生什么

1. 前端打开后，`useAgents` 立即调用 `POST /api/system/bootstrap`。
2. 后端发现 `multiagent/hermes-agent:local` 镜像不存在，于是：
   - `git clone https://github.com/NousResearch/hermes-agent backend/.cache/hermes-agent`
   - `docker build -t multiagent/hermes-agent:local backend/.cache/hermes-agent`（首次比较慢）
3. 之后每个 agent 创建时只需 `docker create + start`，秒级完成。

## REST 接口

与前端 [`src/api/agents.js`](../frontend/vite-project/src/api/agents.js) / [`src/api/chat.js`](../frontend/vite-project/src/api/chat.js) 一一对应。

| 方法     | 路径                            | 说明 |
| -------- | ------------------------------- | ---- |
| GET      | `/api/health`                   | 服务健康 |
| GET      | `/api/system/health`            | docker 是否可达 |
| POST     | `/api/system/bootstrap`         | 拉起所有已存在 agent 的容器（幂等） |
| GET      | `/api/agents`                   | 列出所有 agent |
| POST     | `/api/agents`                   | 新建 agent + 创建容器 + 写入 systemPrompt |
| GET      | `/api/agents/:id`               | 单个 agent |
| PATCH    | `/api/agents/:id`               | 编辑 name / emoji / role / systemPrompt / model |
| DELETE   | `/api/agents/:id`               | 删除 agent + 停止/删除容器 + 删除 volume |
| POST     | `/api/agents/:id/chat`          | SSE 聊天，事件：`delta` / `done` / `error` |

### `POST /api/agents/:id/chat` SSE 协议

- `event: delta` `data: {"chunk":"...", "acc":"..."}`：增量 token + 累计内容
- `event: done` `data: {"content":"..."}`：本次回答完成
- `event: error` `data: {"message":"..."}`：发生错误

前端 [`api/chat.js`](../frontend/vite-project/src/api/chat.js) 已实现解析。

## Docker 资源命名

- 镜像：`multiagent/hermes-agent:local`
- 容器：`multiagent-<agent-uuid>`
- 卷：`hermes-data-<agent-uuid>` -> 容器内 `/root/.hermes`

删除 agent 时这三者都会清理。

## 环境变量

| 变量                         | 默认值                                                 | 说明 |
| ---------------------------- | ------------------------------------------------------ | ---- |
| `PORT`                       | `8080`                                                 | 后端监听端口 |
| `HERMES_PROVIDER`            | `minimax-cn`                                           | hermes 用的 LLM provider id（参考 [providers 文档](https://hermes-agent.nousresearch.com/docs/integrations/providers)） |
| `HERMES_DEFAULT_MODEL`       | `MiniMax-M2.7`                                         | 当前端没传 `model` 时使用的默认模型 |
| `MINIMAX_CN_API_KEY`         | -                                                      | **必填**：MiniMax 中国端 API key（`provider: minimax-cn`） |
| `MINIMAX_CN_BASE_URL`        | -                                                      | 可选：覆盖 base URL |
| `OPENROUTER_API_KEY` 等      | -                                                      | 可选：其它 provider key（如 `DASHSCOPE_API_KEY`、`XIAOMI_API_KEY` 与对应 `*_BASE_URL`），启用后即可在前端选择对应模型 |
| `HERMES_IMAGE_TAG`           | `multiagent/hermes-agent:local`                        | 容器镜像 tag |
| `HERMES_REPO_URL`            | `https://github.com/NousResearch/hermes-agent`         | 源码仓库 |
| `HERMES_REPO_REF`            | `main`                                                 | clone 的分支/tag |
| `CHAT_TIMEOUT_MS`            | `600000`                                               | 单次 chat 的超时（毫秒）|
| `DOCKER_SOCKET`              | 空（自动选）                                           | 自定义 docker 通信端点 |

## Provider 是怎么生效的

后端在创建/启动 agent 容器后，会按官方文档（[AI Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)）的方式向容器内写入两个文件：

- `/root/.hermes/.env`：包含当前 `HERMES_PROVIDER` 对应的所有 API key（例如 `MINIMAX_CN_API_KEY=...`）
- `/root/.hermes/config.yaml`：

  ```yaml
  model:
    provider: minimax-cn
    default: MiniMax-M2.7
  ```

修改 `backend/.env` 之后只需要重启后端，再调一次 `/api/system/bootstrap`（前端打开会自动调），就能让所有 agent 容器同步到新的配置。

如果你想换 provider，例如换到 OpenRouter：

1. 在 `backend/.env` 把 `HERMES_PROVIDER=openrouter`、`OPENROUTER_API_KEY=...`，并相应地改 `HERMES_DEFAULT_MODEL`
2. 调整前端 [`AgentDialog.vue`](../frontend/vite-project/src/components/AgentDialog.vue) 里 `MODELS` 下拉的备选项
3. 重启后端 + 刷新前端

## 已知坑

- **Windows 原生不支持 hermes**：所以容器层只能跑在 Docker Desktop（WSL2 后端）里；Node 后端在 Windows 主机上通过命名管道（`//./pipe/docker_engine`）连 Docker，是支持的。
- **hermes 非交互调用**：本服务用 `printf %s "$prompt" | hermes ask` 兜底到 `printf %s "$prompt" | hermes`。如果未来 hermes 改了 CLI，需要在 [`src/routes/chat.js`](src/routes/chat.js) 的 `buildHermesInvocation` 里更新。
- **首次镜像构建较慢**：会拉很多 Python 依赖。bootstrap 接口在镜像就绪前会阻塞，前端会显示 "正在拉起 hermes 容器…"。
- **API key 全局共享**：所有 agent 容器读同一份 `.env`。如果以后要 per-agent key，扩展 `agents` 表加列即可。
# multiagent
