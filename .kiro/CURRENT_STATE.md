# Current State — KainClaw

> 代码目录名为 `vscode-extension/`（历史原因保留，不代表产品形态）。kainclaw 当前运行在 **Electron 桌面壳**里，不是 VS Code 扩展。

> **Single source of truth for project-level current state.**
> Update this file after every verified checkpoint. Do NOT scatter state across CLAUDE_HANDOFF.md and implementation-memory.md.

## Test Baseline

| Metric | Value | Last Updated |
|--------|-------|--------------|
| Test files | 185 | 2026-07-23 |
| Tests passing | 1531 | 2026-07-23 |
| Last verified commit | see `git log --oneline -1` | — |
| Last clean verification | 2026-07-23 — Electron MCP permission rules | — |

**Required passing commands:**
```bash
npm test
npm run check
npm run build
npm run build:electron   # only when Electron behavior changed
```

## ⚠️ Architecture Traps — Read Before Writing Any Primer

### Image Chat 双渲染路径（高频踩坑）

`electron/renderer/index.html` 里存在**两套并行的 image chat 渲染路径**：

| 路径 | 函数 | 位置 | 状态 |
|------|------|------|------|
| **ichat-v2（当前 active）** | `renderIchatMessage()` | line ~14812 | ✅ 用户看到的 |
| 旧路径（legacy）| `renderImageChatThreadMessages()` | line ~5489 | ❌ 已废弃，勿改 |

**规则**：所有 image chat 新功能必须加在 `renderIchatMessage()` 里，绝对不要改 `renderImageChatThreadMessages()`。旧函数头部已加 `⚠️ LEGACY PATH` 注释。

### `renderImageChatThreadPanel()` 调用了哪个？

两个都调。但 `#ichat-messages` 容器（用户可见）由 `renderIchatMessage` 填充，`image-chat-preview-body`（右侧 stage 面板）由旧路径填充。新功能必须面向 `#ichat-messages`。

### Primer 写法要求

凡是涉及 image chat 消息渲染的任务，primer 必须明确写：
> 渲染入口是 `renderIchatMessage()`（index.html ~line 14812），不是 `renderImageChatThreadMessages()`

---

## Active Tasks

> 只列 OPEN / DEFERRED 任务。CLOSED 任务见下方折叠区。

| Beads ID | Title | Status | Primer |
|----------|-------|--------|--------|
| vscode-extension-f4v | extension.ts 宿主总控继续下沉 | DEFERRED | `.kiro/primers/vscode-extension-f4v.md` |

<details>
<summary>已关闭任务（展开查看完整历史）</summary>

| Beads ID | Title |
|----------|-------|
| vscode-extension-gpf4.1 | MCP Phase 3a: Electron OAuth login and logout |
| vscode-extension-gpf4.2 | MCP Phase 3b: Require approval for workspace MCP servers |
| vscode-extension-gpf4.3 | MCP Phase 3c: Persist server and tool permission rules |
| vscode-extension-912h | KainClaw Electron MCP settings UI |
| vscode-extension-piky | KainClaw MCP registry service and config CRUD |
| vscode-extension-3yn | v3: sez regression — transient draft anchor clears on project switch |
| vscode-extension-3ka | v3: image ownership writeback — light provenance on use |
| vscode-extension-sez | v3: project lifecycle cleanup — transient draft display + ghost row prune + formal promote trigger |
| vscode-extension-ut1 | v3: recoverable error contract — DESIGN_PROJECT_BINDING_MISSING |
| vscode-extension-gqr | v3: canonical history authority — DesignProjectStore as single source of truth |
| vscode-extension-yth | [v3-pre-spec] Resolve the five open Midtai/Design migration decisions |
| vscode-extension-z69 | [UX][i18n] 设计 question form 的 Direction / Accent override 对中文用户不可用 |
| vscode-extension-0wm | TeamCreate/TeamDelete/SendMessage: 命名团队管理工具 |
| vscode-extension-kqy | ConfigTool: 设置读写工具 |
| vscode-extension-zje | SessionMemory: 会话内笔记服务 |
| vscode-extension-yck | PowerShellTool: Windows PowerShell 专用工具 |
| vscode-extension-qhf | SleepTool: 自主循环等待工具 |
| vscode-extension-jzu | midtai-p4: Unified Workbench UI 整体改造 |
| vscode-extension-1t6 | midtai-p3c: 主 chat 侧栏 design session 下沉 |
| vscode-extension-1vp | midtai-p3b: conversationHistory 迁移到 project 层 |
| vscode-extension-p1y | midtai-p3a: design chat 与 project 真绑定 |
| vscode-extension-vlv | midtai-p2c: 临时工作态升级完整流程 |
| vscode-extension-3f1 | midtai-p2b: 分流弹框 |
| vscode-extension-kfr | midtai-p2a: 作品库统一页完善 |
| vscode-extension-0uv | midtai-p1d: 顶部作品库入口与壳层页 |
| vscode-extension-qj9 | midtai-p1c: 新建作品进入临时工作态 |
| vscode-extension-h82 | midtai-p1b: 设计 tab 左侧最近作品列表 |
| vscode-extension-73d | midtai-p1a: 图像 tab 右侧三段式重排 |
| vscode-extension-3q7 | Midtai 画布：调节/导出/版本历史三项能力接入 |
| vscode-extension-wnz | Midtai 画布：滑块面板浮层化 + 版本历史按项目过滤 |
| vscode-extension-u7w | 图像我的作品：缩略图持久化 |
| vscode-extension-9pz | codebase-memory-mcp integration |
| vscode-extension-uyl | Plan Mode V2 多阶段规划提示词升级 |
| vscode-extension-tgx | CronCreate / CronDelete / CronList 工具 |
| vscode-extension-650 | Micro-compact：长会话工具结果轻量清理 |
| vscode-extension-8ib | 导出 ZIP：HTML + 资源打包下载 |
| vscode-extension-40p | 品牌设计系统库：左侧面板品牌参考 tab |
| vscode-extension-wsy | 示例库 Showcase：设计页面预置 prompt 模板 |
| vscode-extension-e3m | 引导问题表单：输入框展开态（静态版） |
| vscode-extension-lb4 | Design Skill 扩展：输出类型从5个扩展到12个 |
| vscode-extension-e0i | Midtai 图像整合：左侧表单 + 生成预览 + 提示词库 |
| vscode-extension-mjj | 中台设计表单：输出类型 + 视觉方向选择器 |
| vscode-extension-aw5 | Design Prompt 质量升级（Anti-Slop + Direction Spec）|
| vscode-extension-fo7 | Midtai 画布选择模式 + Replace 流 |
| vscode-extension-o6a | My Works UI 对齐设计稿（design-wcard 样式）|
| vscode-extension-e38 | My Works 真实数据接入 |
| vscode-extension-175 | Design 生成流式输出（onToken + shimmer）|
| vscode-extension-pmh | Design Home UI 升级（缩略图+网格）|
| vscode-extension-a4o | Design 项目删除 + 重命名 |
| vscode-extension-nce | 首屏设计入口默认显示 Design Home |
| vscode-extension-bdi | Design 导出全部失效（HTML/PDF/PPTX）|
| vscode-extension-j31 | LLM 意图路由器超时 800ms → 5000ms |
| vscode-extension-yi9 | lastOpenedDesignProjectId 跨 session |
| vscode-extension-ged | Canvas Toolbar（View/Select/Tweaks）|
| vscode-extension-0pq-4 | Patch Popover 贴近元素 |
| vscode-extension-0pq-3 | 左侧面板阶段 A/B |
| vscode-extension-w0i | design_versions 缺列迁移补丁 |
| vscode-extension-0pq-2 | Tweaks 右侧抽屉 |
| vscode-extension-0pq | Design Home UI（阶段 1）|
| vscode-extension-vwq | Hooks: 官方事件名兼容 + Notification/SessionStart |
| vscode-extension-lca | Hooks: 用户配置接入触发链 |
| vscode-extension-crs | Hooks: WorktreeCreate + WorktreeRemove |
| vscode-extension-7vl | Hooks: SubagentStart/Stop + TaskCreated/TaskCompleted |
| vscode-extension-a41 | Hooks: PostToolUseFailure + PreCompact + PostCompact |
| vscode-extension-ahb | Hooks: Stop + SessionEnd + UserPromptSubmit |
| vscode-extension-pnz | Fast mode: state persistence |
| vscode-extension-8jn | postCompactCleanup: 压缩后状态清理 |
| vscode-extension-vrw | AgentTool: 通用子 Agent 派发工具 |

</details>

## Stable Capabilities (don't need re-verification)

- Provider chain: Anthropic / OpenAI / OpenAI-compatible / Claude CLI
- Session persistence / export / restore
- MCP runtime (transport / resource / result / name normalization / remote OAuth / prompt commands)
- MCP OAuth refresh hardening (`normalizeOAuthErrorBody`, proactive refresh <=300s, invalid_grant cleanup, transient retry, exported `revokeServerTokens`)
- File tools / command tools / browser tools
- Tasks / background commands
- built-in Review / Verification (/review, /verify)
- Electron/main runtime built-in Agent wiring (`Agent` exposed in Electron, `spawnSubAgent` injected in prompt runtime, shared launcher at `src/agent/built-in/runBuiltInSubAgent.ts`, `general-purpose` / `Explore` / `verification` launchable through the same built-in subagent execution chain in Electron and WorkspaceRuntimeHost)
- First-pass subagent token-cost controls (`general-purpose` built-in agent uses a shorter delegated-task prompt, built-in `general-purpose` tool schema excludes orchestration-only tools, swarm workers use a focused worker-only prompt, Anthropic adapter exposes lightweight request metrics/debug hooks and explicitly reports prompt-cache as unsupported today)
- Thinking / Effort / Fast mode
- Cron / Scheduler (CronCreate / CronDelete / CronList tools, `.cain/scheduled_tasks.json` persistence, session-only in-memory tasks, 1s scheduler loop)
- Plan Mode V2 (Phase 1: Explore → Phase 2: Design → Phase 3: Present, `src/planMode/planModePrompt.ts`)
- Micro-compact (lightweight tool result clearing before auto-compact, `src/compact/microCompact.ts`)
- ToolRuntime utility set: Sleep / PowerShell / SessionMemory / Config (effortLevel, fastMode, showThinkingSummaries, verbose, uiLanguage, read-only model)
- Team registry utilities: TeamCreate / SendMessage / TeamDelete with compact-time registry reset
- Auto-Memory
- LSP phase 1 + partial phase 2
- Worktree phase 1
- Hooks execution chain (user .cain/hooks.json 接入触发链 / PreToolUse 官方别名 / Notification + SessionStart 事件 / WorktreeCreate + WorktreeRemove 20/27 事件已接线)
- Custom Agents registry / Skills registry
- codebase-memory-mcp integration (global install, project indexed as `E-claudecodejingiang-vscode-extension`, `auto_index=true`, repo `AGENTS.md` index-first guidance)
- User modeling
- Design chat path B Build Runtime: temp workspace `.design-chat-runs/<session>/<run>/`; Discovery Turn = read-only tools; Build Turn opens `write_file`/`replace_in_file`/`list_files` scoped to temp workspace (two-layer sandbox: workspaceRoot + `assertDesignChatRunWritePath`); writes within `designChatRunRoot` skip approval dialog; host validates `output/index.html` (exists + non-empty + DOCTYPE) before converting to artifact
- Design chat skill bundle: `skills/<type>/SKILL.md` is now the primary entry point for landing-page, dashboard, mobile-app, slide, pricing-page, social-carousel; flat `.md` files kept as fallback (frozen); seed asset validation hard for bundle types, soft warning for flat-only
- Design chat path B skill workflows now live in disk-backed `skills/*.md` files with prompt-level `read_file` instructions and fallback in `src/design/designPrompt.ts`
- Design chat path B system prompt now carries OpenDesign-style discovery philosophy, TodoWrite planning, and seed-asset guidance; OpenDesign seed assets are present under `skills/mobile-app/`, `skills/slide/`, `skills/dashboard/`, and `skills/landing-page/`
- KainClaw Design (generate / iframe / sliders 右侧抽屉 / canvas toolbar / patch popover 贴近元素 + selector 定位 / 左侧面板 A/B / version history / export HTML+PDF+PPTX / lastOpenedProjectId 跨 session)
- Electron artifact panel persistence (collapse / restore strip / per-session collapsed state / version navigation)
- Image Lab chain (generate / edit / Prompt Library / reference image search / asset-backed gallery storage / paged image-material library thumbnails)
- Midtai P0 foundations (explicit `midtai:open` routing, library DTO aggregation, deterministic design image replacement IPC)
- Midtai My Works (design-wcard 卡片：gradient thumb / hover lift / dark version badge / source color badges / 图片网格 158px + 设计网格 210px)
- Midtai Canvas Selection (fo7 bridge: 选择模式 crosshair → node panel → Replace 图片 / 去 Image Lab / 从我的作品选择)
- Midtai Canvas Controls (3q7/wnz bridge: 调节 sliders → `__kc_apply_slider_values` iframe bridge / 调节浮层可拖拽 / 导出 HTML+PDF+PPTX 菜单 / 版本历史按当前项目过滤并可恢复)
- KainClaw Design Prompt 质量升级 (Anti-Slop 9 条规则 + DesignDirectionSpec OKLch 调色板 + posture 注入，4 套方向含完整 spec)
- Design chat path B visual direction picker (Turn 1 追加“视觉风格方向”可选题；Turn 2 解析 form answers 中的方向值并注入 `renderDirectionSpec()` CSS binding block；skip 时保持自由判断)
- Midtai 设计表单 (输出类型 select + 视觉方向卡片选择器，按输出类型动态渲染，选中值传入 generateDesignWorkbench)
- Midtai Design Skill 扩展 (12 个输出类型，含 8 个新 skill prompt 约束 + renderer 双入口 select + directions fallback)
- Midtai Guide Form + Showcase (静态引导问题表单、模板卡片库、skill/prompt 一键回填、`userContext` 透传链路)
- Midtai Brand Systems (视觉方向 / 品牌参考双 tab、15 个品牌卡片、`brandContext` system prompt 注入)
- Midtai ZIP Export (导出 ZIP，包含 `index.html` 与从 HTML 内抽出的本地 data URL 资源文件)
- Midtai 图像整合 (左侧图像表单 + 比例/数量控件 + 生成预览 shimmer/结果卡片 + 静态提示词库 + 插入到对话)
- Midtai Unified Workbench (p1-p4: 统一工作台 UI / design:switch-project / conversationHistory project 层 / design session 侧栏下沉)
- Design Home stripping complete (Phase 1-5): Midtai open, recent works, new design question form generation, canvas patch/return, version restore, image material writeback, and cross-work switching all passed final manual smoke; duplicate renderer project tracking and Design Home-only host glue are removed
- v3 canonical history authority (gqr / cddd9b8): `DesignProjectStore.conversationHistory` is the only durable source; `designFlowState.conversationHistory` is stripped from `.state.json` on every save, kept only as in-memory projection; legacy backfill (session state → project store) fires on first `design:switch-project` when project history is empty
- v3 Project-only design lifecycle (28m.3): clicking `新建作品` creates a real draft Project immediately, Recent Works is Project-backed, quick/detailed entry paths keep stable `projectId`, and Electron smoke verified draft creation/switching behavior
- Design entry dialog (c68): old 小白/专业 toggle is gone; quick path shows the 3-question form, detailed path sends `__trigger_discovery__`, and Electron smoke verified the entry messages and `designMode=pro`
- Local Bridge / Word Add-in (read + write-back + Track Changes + comments)
- Electron i18n (shellStrings covering all surfaces)

## Known Non-Blocking Tail Items

- Deleting the last provider may show "Provider not found" in chat area
- `supabase` MCP may occasionally show `Connection closed`

## Key Risks (still active)

- `src/extension.ts` — still large; **f4v 减债已降级**，等功能速度放缓后再做（频繁加功能期间减债 ROI 低）
- `electron/renderer/index.html` — single-file renderer; prone to inline script regressions
- `src/webviewHtml.ts` — large template string; fragile escaping

## Current Focus

- **Image Chat Touch Edit closed (`vscode-extension-kcy9`)**: the unified editor now supports overall and brush-mask local edits for both chat-history and selected Midtai images. A renderer compositor bug that exported fully transparent masks is fixed: the uploaded PNG now has an opaque black background and opaque white painted pixels. Electron smoke verified the editor, brush state, mask pixels, and actual `image:touchEdit` IPC payload; live provider execution still requires a configured `gpt-image-*` model.
- **MCP Phase 5 closed (`vscode-extension-gpf4.5`)**: MCP settings now preview/import Codex, Claude Desktop, and Claude Code server definitions, install fetch/browser/read-only-filesystem/hotel templates, and export workspace config. Static sensitive env/header values are dropped on import and redacted on export; environment placeholders remain references. Electron exposes these flows without moving registry logic into the renderer. Next planned MCP work is Phase 6, KainClaw as an MCP server, deferred until inbound permissions and session isolation are designed.
- **MCP Phase 4 closed (`vscode-extension-gpf4.4`)**: `src/mcp/rollinggoHotelServer.ts` exposes the RollingGo hotel CLI through a standard stdio MCP server. Search/detail are read-only, price confirmation is open-world and non-destructive, booking is explicitly destructive, and all CLI output is recursively credential-redacted. The server is compiled into `dist/mcp/rollinggoHotelServer.js` and can be added through the existing MCP configuration/UI without Electron changes. Next MCP work is Phase 5 import/templates/marketplace-lite.
- **MCP Phase 3c closed (`vscode-extension-gpf4.3`)**: local KainClaw storage now persists canonical `mcp__server__tool` allow/deny rules, including server shorthand and `mcp__server__*`. Runtime derives keys from resolved MCP metadata, so model aliases cannot bypass a rule; deny wins. Plan/verification restrictions still run first, and destructive MCP tools still require one-time confirmation even when allowed.
- **MCP Phase 3b closed (`vscode-extension-gpf4.2`)**: workspace `.mcp.json` / `.cain-mcp.json` servers now require an explicit local approval before `McpRuntime` exposes any tools or opens a connection. Decisions are stored under KainClaw local storage and keyed by workspace root, config source, server name, and configuration hash. Electron shows approval state and supports approve, reject, and reset without conflating approval with enabled/disabled. Phase 3c is persistent server/tool permission rules.
- **MCP Phase 3a closed (`vscode-extension-gpf4.1`)**: the Electron MCP page can start remote OAuth, show a safe browser authorization link, report completion/failure, and log out without deleting server configuration. `McpRuntime` remains responsible for token storage, callback validation, and revocation.
- **MCP Phase 2 closed (`vscode-extension-912h`)**: the existing Electron MCP page now manages stdio/HTTP/SSE configuration through `McpRegistry` IPC, combines config source/enabled state with live runtime status, and refreshes when opened. Phase 3 covers OAuth UX, project approval, and persistent permissions.
- **MCP Phase 1 closed (`vscode-extension-piky`)**: `src/mcpRegistry.ts` now owns workspace MCP config CRUD, validation, enable/disable, and Codex TOML import. Environment placeholders remain references and static authentication headers are not copied. Phase 2 is the Electron MCP Settings UI.
- **v3 Design Project Lifecycle 已收口**（yth / gqr / ut1 / sez / 3ka / 28m.3）：
  - gqr：`DesignProjectStore.conversationHistory` 是唯一持久真相源，session 只做内存 projection
  - ut1：patch/edit 缺 binding 时返回 `DESIGN_PROJECT_BINDING_MISSING`，renderer 按 `code` 展示可恢复提示
  - sez：Recent Works 显示 draft 条目，启动/刷新自动 prune 三无 ghost row，formal project 只在 durable save 或 artifact→design promote 时创建
  - 3ka：`design:patchImageNode` 成功后写 `lastUsedByProjectId` 轻量 provenance，生成时不写
  - 28m.3：`Project` 成为唯一 work identity，新建设计立即创建 draft Project，Electron smoke 已验证
- **设计入口 c68 已验证**：详细路径触发 discovery，快速路径保持本地 3 问表单，不再显示小白/专业 toggle
- **主 chat parity / 工具渲染 parity 已收口**（`vscode-extension-kb2p` / `vscode-extension-5mxw`）：
  - 已重读上游 Claude thinking/tool-use/tool-result 组件
  - renderer 已对齐 persisted thinking 的 `∴ Thinking` collapsed UI
  - `run_command` pending/completed DOM smoke 已通过：permission/progress 行在 tool header 下方，完成态顺序为 `Bash -> result -> assistant summary`
  - `read_file` + `glob_files` injected DOM smoke 已通过：read summary + compact glob preview lines
  - 真实模型驱动 `read_file` 已由用户截图验证：`Read package.json` 工具行 + `Read 89 lines` compact result + concise summary
  - 真实模型驱动 `glob_files/search_files` 已由用户截图验证：宽泛 glob 失败会显示可读错误，不再是空白红色 Search；收窄后显示 `65 files matching "**/*prompt*.ts"` 与 compact preview lines
  - 答案质量尾项已收口：`SYSTEM_PROMPT` 现在要求文件/测试/覆盖总结必须基于实际证据，不能在未验证完整实现/测试映射时声称每个实现文件都有同名 `.test.ts`
  - beads 已更新并关闭：`vscode-extension-kb2p` / `vscode-extension-5mxw`
- **Direction Library cuc 已收口**：`src/design/directions.ts` 暴露 5 个中文方向（`lifestyle-redbook` / `streetwear-dark` / `tech-flagship` / `ecommerce-convert` / `short-video`），Turn 1 direction-cards 与 Turn 2 CSS binding block 已有测试覆盖

- **Midtai My Works Kanban 26q closed**: Design library now has Grid / Board toggle; Board columns derive Current, Draft, and Versioned from existing designLibraryItems without persisting new status. Verified JS syntax, build:electron, build, check, and test.
- **Midtai Canvas Sketch Annotation 0z5 closed**: Canvas toolbar now has an in-memory `标注` mode with an overlay canvas above the iframe, clear control, resize sync, and mode exit restoring iframe interaction. Verified JS syntax, build:electron, build, check, and test. Manual Electron smoke is still recommended.

## Not Yet Started

- Browser Bridge / Desktop automation / Computer Use
- Full desktop Skills / Agents / Hooks UI
- Full Office chain (Excel/PowerPoint)
- Full Windows release client
- Voice mode / Prompt suggestion / Plugin market

---

*Update this file (test counts + active task) whenever a task closes or baseline changes.*
