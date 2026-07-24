# KainClaw MCP Productization Plan

Date: 2026-07-16

## 实施状态 / Implementation Status

- 2026-07-23：Phase 1 已完成。`McpRegistry` 提供工作区 MCP 的列表、添加、更新、删除、启用/禁用、校验和 Codex TOML 导入；导入保留环境变量引用，不写入静态认证密钥。
- 2026-07-23: Phase 1 is complete. `McpRegistry` provides workspace MCP list/add/update/remove/enable/disable/validation and Codex TOML import; imports preserve environment references and do not copy static authentication secrets.
- 2026-07-23：Phase 2 已完成。现有 Electron MCP 页面可以添加 stdio、HTTP 和 SSE server，显示配置来源和实时连接状态，并支持刷新、启用/禁用和删除。
- 2026-07-23: Phase 2 is complete. The existing Electron MCP page can add stdio, HTTP, and SSE servers, shows configuration source plus live connection state, and supports refresh, enable/disable, and remove.
- 2026-07-23：Phase 3a 已完成。Electron MCP 页面支持 remote server 登录/退出登录，显示浏览器 OAuth 授权链接；token 存储、回调校验和撤销仍由 `McpRuntime` / `mcpOAuth` 处理。
- 2026-07-23: Phase 3a is complete. The Electron MCP page supports remote-server login/logout and surfaces the browser OAuth authorization link; token storage, callback validation, and revocation remain in `McpRuntime` / `mcpOAuth`.
- 下一步 / Next: Phase 3b project MCP approval, then Phase 3c persistent permissions.

## 中文版

### 结论摘要

KainClaw 的 MCP 不是没做，而是“运行时底座基本可用，产品化还没完成”。

现在已有的能力包括：

- 从工作区向上发现 `.mcp.json` / `.cain-mcp.json`
- 支持 stdio / HTTP / SSE 类型的 MCP server
- 能读取工具列表、调用工具、读取 resources、加载 MCP prompts
- 有 OAuth token 存储与刷新逻辑
- 有 `/mcp`、`/mcp prompts`、`/mcp auth <server>` 这类对话命令
- 有 plan / verification 模式下的只读工具保护
- 对 `destructiveHint` 工具有二次确认
- Electron 侧能刷新并显示 MCP server 状态

真正缺的是这些：

- 没有完整 MCP 设置界面，用户不能在 UI 里添加、编辑、删除、禁用、登录、登出 MCP server
- 配置作用域还比较薄，没有 Claude Code 那种 user / project / local / plugin / enterprise 的分层与优先级
- 缺少每个 server 的健康状态、错误日志、工具详情、schema 预览、资源/Prompt 入口
- OAuth 体验还不够产品化，授权链接、登录状态、失败恢复都需要显式 UI
- 没有 Claude Code 的 MCPB / DXT / 插件式安装能力
- 没有 Codex/Claude 配置导入能力
- KainClaw 还不能像 Codex `mcp-server` 或 Claude `mcp serve` 那样把自己暴露成 MCP server
- `hotel-core` 现在只是 Skill + CLI，不是正式 MCP server

推荐方向：保留 `src/mcpRuntime.ts` 作为执行核心，新增 MCP registry / management 层，再接 Electron 设置界面。`hotel-core` 应该作为第一个真实业务 MCP wrapper 来验证整条链路。

### 本地证据

KainClaw 当前 MCP 运行时：

- `src/mcpRuntime.ts` 已经发现 `.mcp.json` / `.cain-mcp.json`
- `McpRuntime` 已经管理 server config、connection、tool metadata、prompt metadata、server status
- 已调用 MCP SDK 的 `listTools()` 和 `callTool()`
- 已通过 `prompts/list` 加载 MCP prompt commands
- 已有 `ListMcpResourcesTool` / `ReadMcpResourceTool`
- 已在 plan mode / verification mode 中拦截非只读 MCP 工具
- 已对 destructive MCP 工具请求确认
- `src/mcpOAuth.ts` 已有 OAuth host、secret/state 存储、token 刷新
- `electron/ElectronChatPanel.ts` 已有 `mcp:refresh` / `mcp:status`

Claude Code 源码参考（本地外部参考，不随仓库发布）：

- `cli/handlers/mcp` 提供 `mcp list/get/add-json/remove/serve/add-from-desktop/reset-project-choices`
- `services/mcp/types` 支持 stdio、SSE、HTTP、WebSocket、SDK、Claude.ai proxy
- `services/mcp/config` 提供配置校验、scope 优先级、project MCP approval、plugin MCP 合并
- `components/mcp` 提供 MCP settings/list/tool detail UI
- `utils/settings/permissionValidation` 提供 `mcp__server`、`mcp__server__*`、`mcp__server__tool` 级别权限规则
- `utils/plugins` 提供 MCPB / DXT / plugin manifest 的 MCP server 装载逻辑

当前 Codex 参考：

- 本机 Codex 版本是 `codex-cli 0.112.0`
- `codex mcp` 支持 `list/get/add/remove/login/logout`
- `codex mcp add` 支持 stdio 与 streamable HTTP
- `codex mcp login` 支持 OAuth scopes
- `codex mcp-server` 可以把 Codex 自己作为 stdio MCP server 暴露出去
- `~/.codex/config.toml` 用 `[mcp_servers.<name>]` 管理 MCP server
- 当前本机已有 `fetch`、`node_repl`、`pencil` 三个 Codex MCP server

### 目标产品形态

KainClaw MCP 最终应该分成三层：

1. Runtime 层
   - 保持 `McpRuntime` 专注于连接、发现工具、执行工具、读取 resources、执行 prompts、安全拦截。

2. Registry / Management 层
   - 新增服务负责 add / edit / remove / enable / disable / import / login / logout / test connection。
   - 支持 scope、冲突处理、配置校验、导入导出。

3. Desktop Product 层
   - Electron 设置页提供 MCP server 列表、状态、登录、工具详情、资源、prompts、日志、引导式安装。
   - Renderer 只做 UI 和 IPC，不承载 MCP 业务逻辑。

### 差距清单

| 模块 | 当前 KainClaw | Claude / Codex 参考 | 需要补的 |
| --- | --- | --- | --- |
| Runtime 连接/调用 | 已较完整 | 已完整 | 保持现有核心 |
| 配置发现 | `.mcp.json`、`.cain-mcp.json` | Claude 多 scope，Codex TOML | 做 registry 和导入 |
| 配置增删改 | 缺 UI/API | Claude/Codex 有 CLI | 做 management service |
| 状态 UI | 只有基础状态 | Claude 有分组、状态、详情 | 做完整设置页 |
| OAuth UX | 有 runtime placeholder | Claude/Codex 有显式 login | 做登录/登出 UI |
| 权限 | destructive approval + plan guard | Claude 有 MCP 权限规则 | 做持久 allow/deny |
| Project approval | 不成熟 | Claude `.mcp.json` approval | 做项目 MCP 审批 |
| 工具详情 | runtime 有定义 | Claude 有 tool detail UI | 做 schema/detail panel |
| Resources/prompts | runtime 支持 | Claude 有入口 | 做 UI 入口 |
| Plugin/MCPB | 缺失 | Claude 支持 MCPB/DXT | 后续阶段 |
| KainClaw as MCP server | 缺失 | Codex/Claude 都有 | 后续阶段 |
| Hotel integration | Skill + CLI | 应该变 MCP tools | 包正式 MCP server |

### 分阶段计划

#### Phase 0：固化 parity 结论与拆任务

目标：先把 MCP 目标边界定下来，不急着改代码。

要做：

- 把这份计划沉淀到官方 gap 记录或 MCP 专项 gap 文档
- 创建 beads issue 和 primer
- 明确 `hotel-core` 当前只是 Skill + CLI，不算 MCP 功能闭环

验收：

- 每个阶段都有独立任务和 primer
- 不改变 runtime 行为

#### Phase 1：MCP Registry Service

目标：先做非 UI 的配置管理服务。

建议文件：

- `src/mcpRegistry.ts`
- `src/mcpRegistry.test.ts`
- `src/mcpRuntime.ts` 只做必要的小接口补充

能力：

- 列出 server，带来源路径、scope、启用状态、auth 状态、最近错误
- 添加 stdio server
- 添加 HTTP / SSE server
- 删除 server
- 启用 / 禁用 server
- 校验 server name 和 config schema
- 从 `.mcp.json`、`.cain-mcp.json`、`~/.codex/config.toml` 导入

验收：

- 单测覆盖 add/remove/duplicate/invalid/import Codex TOML
- 原有 `McpRuntime` 测试继续通过
- 本阶段不碰 Electron UI

#### Phase 2：Electron MCP Settings UI

目标：让用户不用手改 JSON/TOML 就能管理 MCP。

UI 范围：

- Settings 里新增 `MCP` tab
- 按 scope/source 分组显示 server
- 状态包括 disabled、connecting、connected、needs auth、error
- 添加 server 向导：
  - stdio：name、command、args、env
  - remote：name、URL、transport、headers、bearer-token env var、OAuth
- server detail：
  - config 摘要
  - tool count
  - resources / prompts 支持状态
  - last error
  - refresh / login / logout / disable / remove
- tool detail：
  - name、description、input schema、annotations

验收：

- UI 能添加一个简单 stdio MCP server
- refresh 后能看到工具
- UI 能 disable/remove
- `/mcp` 命令仍然可用

#### Phase 3：Auth、审批、权限

目标：让远程 MCP 和项目 MCP 足够安全。

要做：

- 每个 remote server 有明确 login/logout
- UI 展示 OAuth 授权链接、完成状态、失败状态
- 新发现的 `.mcp.json` server 需要项目级 approval
- 增加持久权限规则：
  - server-level allow/deny
  - tool-level allow/deny
  - wildcard `mcp__server__*`
- 保留现有 plan / verification read-only guard

验收：

- remote OAuth server 能从 `needs auth` 登录到 connected
- 拒绝的 project server 不加载工具
- destructive MCP 工具即使 server 已启用，也必须二次确认

#### Phase 4：`hotel-core` 正式 MCP Wrapper

目标：把酒店 CLI 包成真正 MCP server，而不是只靠 Skill 调 CLI。

当前状态：

- 外部 hotel-core 项目是 Skill + CLI wrapper
- 底层命令是 `npx -y @rollinggo/hotel@latest`
- 支持 `login/logout/whoami/hotel-tags/search-hotels/hotel-detail/price-confirm/book/orders`

建议 MCP tools：

- `hotel_whoami`
- `hotel_login_status`
- `hotel_search_hotels`
- `hotel_detail`
- `hotel_price_confirm`
- `hotel_book`
- `hotel_orders`

安全规则：

- `hotel_detail` / `hotel_search_hotels` 是 read-only
- `hotel_price_confirm` 属于 open-world，但不算 destructive
- `hotel_book` 必须设置 `destructiveHint: true`，必须用户确认
- 工具输出里绝不暴露 token/cookie

验收：

- KainClaw 能通过 UI 或 config 添加 hotel MCP server
- 用户问酒店价格时返回结构化房型/价格
- 预订动作被明确确认拦截

#### Phase 5：导入、模板、轻量市场

目标：降低普通用户安装 MCP 的门槛。

要做：

- 从 Codex `~/.codex/config.toml` 导入
- 从 Claude Desktop / Claude Code 配置导入
- 增加模板：
  - fetch
  - browser / Playwright bridge
  - read-only filesystem 示例
  - hotel
- 支持 config export

验收：

- 能检测并预览本机 Codex 的 `fetch`、`node_repl`、`pencil`
- 导入不把 secrets 明文复制进配置
- 用户不写 JSON/TOML 也能装模板

#### Phase 6：KainClaw as MCP Server

目标：让其他 agent / 工具可以通过 MCP 调用 KainClaw。

候选 tools：

- `kainclaw_chat`
- `kainclaw_list_sessions`
- `kainclaw_open_session`
- `kainclaw_design_generate`
- `kainclaw_image_generate`
- `kainclaw_read_memory`

暂缓条件：

- inbound permission 没设计清楚前不做
- session isolation 没明确前不做
- tool output 没稳定前不做
- 没有明确 agent-to-agent 需求前不做

验收：

- stdio MCP client 可以启动 KainClaw server mode
- 至少能调用一个 harmless read-only tool
- 写入、设计、生图类动作必须 approval + session scoping

### 不做什么

- 不重写 `McpRuntime`
- 不把 MCP 业务逻辑塞进 Electron renderer
- 不提前复制 Claude enterprise policy
- 不把 `hotel-core` Skill + CLI 误判为 MCP 已完成
- 不在 MCP CRUD / auth UX 稳定前做大市场

### 验证计划

每个实现阶段至少跑：

- config parsing / validation 单测
- fake stdio MCP server runtime 测试
- mocked OAuth 测试
- Electron 手测：status refresh、add/remove、auth、tool detail
- `npm test`
- `npm run check`
- `npm run build`
- 改 Electron UI / IPC 时跑 `npm run build:electron`

### 推荐下一步

先做 Phase 1：`MCP Registry Service`。

原因很简单：它是后续所有 UI、导入、hotel MCP wrapper、权限管理的共同地基。没有 registry，UI 会直接改配置文件，后面很容易又变成一堆散乱逻辑。

---

## English Original

## Executive Summary

KainClaw's MCP foundation is not empty. The runtime already supports local config discovery, stdio / HTTP / SSE transports, OAuth token handling, tool listing and calls, resources, prompt commands, status summaries, and destructive-tool approval guards.

The unfinished part is productization:

- users cannot manage MCP servers from a real settings surface
- config scopes are too flat compared with Claude Code
- per-server health, auth, tool detail, logs, and import flows are still thin
- plugin / MCPB / marketplace style installation is missing
- KainClaw cannot expose itself as an MCP server yet
- `hotel-core` is currently a Skill + CLI wrapper, not a formal MCP server

Recommended direction: keep `src/mcpRuntime.ts` as the execution core, add a registry / management layer around it, then build an Electron MCP settings UI and a first real MCP wrapper for `hotel-core`.

## Evidence

### KainClaw Current MCP Runtime

- Config files are discovered upward from the workspace using `.mcp.json` and `.cain-mcp.json`: `src/mcpRuntime.ts`
- Runtime class tracks configs, connections, tool metadata, prompt metadata, and server status: `src/mcpRuntime.ts`
- Tool discovery calls MCP `listTools()`: `src/mcpRuntime.ts`
- Tool execution calls MCP `callTool()`: `src/mcpRuntime.ts`
- Prompt commands are loaded via `prompts/list`: `src/mcpRuntime.ts`
- Plan / verification mode blocks unsafe MCP tools based on annotations: `src/mcpRuntime.ts`
- Destructive MCP tools request explicit approval: `src/mcpRuntime.ts`
- OAuth host abstraction stores secrets and state: `src/mcpOAuth.ts`
- OAuth token refresh starts before expiry: `src/mcpOAuth.ts`
- `/mcp`, `/mcp prompts`, and `/mcp auth <server>` exist as prompt commands: `src/promptCommandHost.ts`
- Electron can refresh and render MCP status: `electron/ElectronChatPanel.ts`

### Claude Code MCP Reference

Claude Code has a fuller product surface:

- CLI handlers cover serve, remove, list, get, add-json, import from Claude Desktop, and reset project approvals: `cli/handlers/mcp`
- Supported config types include stdio, SSE, HTTP, WebSocket, SDK, and Claude.ai proxy: `services/mcp/types`
- Config write path validates names, schemas, enterprise policy, allowlists, denylists, and duplicate scopes before saving: `services/mcp/config`
- Scope precedence is plugin < user < approved project < local: `services/mcp/config`
- Project `.mcp.json` servers require approval before activation: `services/mcp/config`
- MCP settings UI lists servers by scope and shows connection / auth status: `components/mcp`
- Tool detail UI exists: `components/mcp/MCPToolDetailView`
- MCP permissions support server-level, wildcard, and tool-level rules: `utils/settings/permissionValidation`
- Plugin manifests can provide MCP servers and MCPB / DXT bundles: `utils/plugins`

### Current Codex MCP Reference

Observed local Codex:

- Version: `codex-cli 0.112.0`
- `codex mcp` supports `list`, `get`, `add`, `remove`, `login`, and `logout`
- `codex mcp add <NAME> -- <COMMAND>...` supports stdio servers
- `codex mcp add <NAME> --url <URL>` supports streamable HTTP servers
- `codex mcp add --bearer-token-env-var <ENV_VAR>` supports HTTP bearer token injection
- `codex mcp login <NAME> --scopes <SCOPE,SCOPE>` supports OAuth login
- `codex mcp-server` starts Codex itself as an MCP server over stdio
- Local config is TOML under `~/.codex/config.toml` with `[mcp_servers.<name>]`; current servers include `fetch`, `node_repl`, and `pencil`

## Target Product Shape

KainClaw MCP should become three layers:

1. Runtime layer
   - Keep `McpRuntime` focused on connecting, discovering, calling tools, reading resources, executing prompts, and enforcing runtime safety.

2. Registry / management layer
   - New service owns add / edit / remove / enable / disable / import / login / logout / test connection.
   - It should support scopes and conflict resolution instead of writing directly from UI.

3. Desktop product layer
   - Electron settings page exposes server list, connection status, auth state, tools, resources, prompts, logs, and guided setup.
   - Renderer only sends IPC requests; all config, validation, OAuth, and subprocess work stays in `src/` or Electron host code.

## Gap Analysis

| Area | KainClaw now | Claude / Codex reference | Gap |
| --- | --- | --- | --- |
| Runtime connect/call | Good | Good | Mostly complete |
| Config discovery | `.mcp.json`, `.cain-mcp.json` | Claude multi-scope, Codex TOML | Need registry and import |
| Config CRUD | Missing UI/API | Claude/Codex CLI CRUD | Add management service |
| Status UI | Basic Electron status | Claude scoped list, detailed states | Add full settings surface |
| Auth UX | Runtime placeholder + OAuth flow | Claude/Codex explicit login flows | Add login/logout per server |
| Permissions | Destructive approval + plan guard | Claude MCP permission rules | Add persistent allow/deny rules |
| Project approvals | Not mature | Claude `.mcp.json` approval choices | Add project server approval flow |
| Tool detail | Tool definitions available | Claude tool detail UI | Add schema/detail panel |
| Resources/prompts | Runtime support exists | Claude exposes resources/prompts | Add UI affordances |
| Plugin/MCPB | Missing | Claude plugin MCPB/DXT support | Later phase |
| KainClaw as MCP server | Missing | Codex `mcp-server`, Claude `mcp serve` | Later phase |
| Hotel integration | Skill + CLI only | Should be MCP tools | Wrap as formal MCP server |

## Implementation Plan

### Phase 0: Parity Notes and Task Split

Goal: freeze the MCP target contract before code changes.

Work:

- Create a short parity note from this plan into `.kiro/official-gap-analysis.md` or a dedicated MCP gap file.
- Create beads tasks for the phases below.
- Mark `hotel-core` as "Skill + CLI now, formal MCP later" to avoid treating the current wrapper as a completed integration.

Acceptance:

- A task queue exists with one implementation primer per phase.
- No runtime behavior changes yet.

### Phase 1: MCP Registry Service

Goal: add a non-UI management API around config.

Suggested files:

- `src/mcpRegistry.ts`
- `src/mcpRegistry.test.ts`
- `src/mcpRuntime.ts` only for small adapter hooks if needed

Capabilities:

- list configured servers with source path, scope, enabled state, auth state, and last error
- add stdio server
- add HTTP / SSE server
- remove server
- enable / disable server
- validate server name and schema
- import from `.mcp.json`, `.cain-mcp.json`, and `~/.codex/config.toml`

Design notes:

- Start with KainClaw scopes: `workspace`, `user`, `localOverride`.
- Map existing `.mcp.json` / `.cain-mcp.json` into `workspace`.
- Do not copy Claude enterprise policy until there is a real product need.
- Do not put config editing into `electron/renderer/index.html`.

Acceptance:

- Unit tests cover add / remove / duplicate / invalid config / import Codex TOML.
- Existing `McpRuntime` tests still pass.
- No Electron UI required in this phase.

### Phase 2: Electron MCP Settings UI

Goal: make MCP visible and manageable without hand-editing config.

Suggested files:

- Electron host IPC methods in `electron/ElectronChatPanel.ts`
- Renderer view in `electron/renderer/index.html`, but only as UI and IPC wiring
- Registry/runtime logic remains in `src/`

UI scope:

- Settings tab: `MCP`
- Server list grouped by source/scope
- Status states: disabled, connecting, connected, needs auth, error
- Add server wizard:
  - stdio: name, command, args, env
  - remote: name, URL, transport, headers, bearer-token env var, OAuth toggle
- Server detail:
  - config summary
  - tool count
  - resources / prompts support
  - last error
  - buttons: refresh, login, logout, disable, remove
- Tool detail:
  - name, description, input schema, annotations

Acceptance:

- User can add a simple stdio MCP server from UI and see its tools after refresh.
- User can disable/remove it from UI.
- Existing `/mcp` command still works.
- Manual smoke covers `fetch` or a dummy stdio MCP server.

### Phase 3: Auth, Approval, and Permission Hardening

Goal: make remote MCP safe enough for everyday use.

Work:

- Add explicit `login` / `logout` actions per remote server.
- Surface browser OAuth URL and completion state in UI.
- Add project MCP approval dialog for newly discovered `.mcp.json` servers.
- Add persistent permission rules:
  - server-level allow/deny
  - tool-level allow/deny
  - wildcard `mcp__server__*`
- Preserve existing plan-mode and verification-mode read-only guard.

Acceptance:

- Remote OAuth server can show `needs auth`, login, then reconnect.
- Declined project server does not load tools until reset/approved.
- Destructive MCP tools require confirmation even if the server is otherwise enabled.

### Phase 4: `hotel-core` Formal MCP Wrapper

Goal: turn the RollingGo hotel CLI into a real MCP server that KainClaw can call like any other server.

Current state:

- An external hotel-core project is a Skill + CLI wrapper around `npx -y @rollinggo/hotel@latest`.
- It supports `login`, `logout`, `whoami`, `hotel-tags`, `search-hotels`, `hotel-detail`, `price-confirm`, `book`, and `orders`.
- It is not a protocol-level MCP server today.

Proposed MCP tools:

- `hotel_whoami`
- `hotel_login_status`
- `hotel_search_hotels`
- `hotel_detail`
- `hotel_price_confirm`
- `hotel_book`
- `hotel_orders`

Safety:

- `hotel_detail` and `hotel_search_hotels` are read-only.
- `hotel_price_confirm` should be treated as open-world but not destructive.
- `hotel_book` must set `destructiveHint: true` and require explicit user confirmation.
- Never expose tokens or cookies in tool output.

Implementation options:

- Short term: local stdio MCP server under `scripts/mcp/rollinggo-hotel-server/`.
- Later: package it as a plugin / MCPB once KainClaw has plugin install support.

Acceptance:

- KainClaw can add the hotel MCP server via UI or config.
- A user can ask for hotel price and receive structured room/rate output.
- Booking flow is blocked on explicit confirmation.

### Phase 5: Import, Templates, and Marketplace Lite

Goal: make common MCP setup one-click enough for non-developers.

Work:

- Import from Codex `~/.codex/config.toml`.
- Import from Claude Desktop / Claude Code config if available.
- Add templates:
  - fetch
  - browser / Playwright bridge
  - filesystem-safe read-only examples
  - hotel
- Add config export.

Acceptance:

- Current Codex `fetch`, `node_repl`, and `pencil` entries can be detected and previewed.
- Import does not copy secrets into plaintext.
- User can install a template without editing JSON/TOML.

### Phase 6: KainClaw as an MCP Server

Goal: allow other agents/tools to call KainClaw capabilities.

Reference:

- Codex exposes `codex mcp-server`.
- Claude Code exposes `mcp serve`.

Candidate KainClaw server tools:

- `kainclaw_chat`
- `kainclaw_list_sessions`
- `kainclaw_open_session`
- `kainclaw_design_generate`
- `kainclaw_image_generate`
- `kainclaw_read_memory`

Defer until:

- inbound permissions are designed
- session isolation is clear
- tool outputs are stable
- product has a real reason for agent-to-agent orchestration

Acceptance:

- A stdio MCP client can start KainClaw server mode and call a harmless read-only tool.
- Write/design/image actions require explicit approval and session scoping.

## Non-Goals

- Do not rewrite `McpRuntime` wholesale.
- Do not move MCP business logic into the Electron renderer.
- Do not implement Claude enterprise policy unless a paid/customer requirement appears.
- Do not treat `hotel-core` as "done" just because the Skill can call a CLI.
- Do not add broad plugin marketplace infrastructure before basic MCP CRUD and auth UX are stable.

## Verification Plan

For each implementation phase:

- Unit tests for config parsing and validation.
- Runtime tests with a fake stdio MCP server.
- OAuth tests with mocked discovery/token endpoints.
- Electron manual smoke for status refresh, add/remove, auth, and tool detail.
- `npm test`
- `npm run check`
- `npm run build`
- `npm run build:electron` when Electron UI or IPC changes.

## Recommended Next Step

Start with Phase 1. It is the highest-leverage missing piece: once KainClaw has an MCP registry service, both the Electron settings UI and `hotel-core` MCP wrapper have a clean integration point.
