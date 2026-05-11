# Current State — KainClaw

> 代码目录名为 `vscode-extension/`（历史原因保留，不代表产品形态）。kainclaw 当前运行在 **Electron 桌面壳**里，不是 VS Code 扩展。

> **Single source of truth for project-level current state.**
> Update this file after every verified checkpoint. Do NOT scatter state across CLAUDE_HANDOFF.md and implementation-memory.md.

## Test Baseline

| Metric | Value | Last Updated |
|--------|-------|--------------|
| Test files | 172 | 2026-05-09 |
| Tests passing | 1358 | 2026-05-09 |
| Last verified commit | see `git log --oneline -1` | — |
| Last clean verification | 2026-05-11 — midtai unified workbench visual QA pass 1 | — |

**Required passing commands:**
```bash
npm test
npm run check
npm run build
npm run build:electron   # only when Electron behavior changed
```

## Active Tasks

> 只列 OPEN / DEFERRED 任务。CLOSED 任务见下方折叠区。

| Beads ID | Title | Status | Primer |
|----------|-------|--------|--------|
| vscode-extension-79t | Midtai Unified Workbench 视觉 QA 与交互收口 | **OPEN — ready** | `.kiro/primers/vscode-extension-79t.md` |
| vscode-extension-a9o | renderer 减债清理：donor 容器与旧兼容函数名 | OPEN (blocks 79t) | — |
| vscode-extension-7q8 | 旧页面尾部依赖迁移：imglab-results/history/workflow/prompt-library | OPEN P3 — ready | `.kiro/primers/vscode-extension-7q8.md` |
| vscode-extension-cs9 | 删除 page-images 页面壳与隐藏入口 | OPEN P3 (blocks: 7q8) | `.kiro/primers/vscode-extension-cs9.md` |
| vscode-extension-uru | imglab-* namespace 与图片渲染函数最终清理 | OPEN P3 (blocks: cs9) | `.kiro/primers/vscode-extension-uru.md` |
| vscode-extension-8jn | postCompactCleanup: 压缩后状态清理 | OPEN P1 | `.kiro/primers/vscode-extension-8jn.md` |
| vscode-extension-vrw | AgentTool: 通用子 Agent 派发工具 | OPEN P1 | `.kiro/primers/vscode-extension-vrw.md` |
| vscode-extension-yck | PowerShellTool: Windows PowerShell 专用工具 | OPEN P2 | — |
| vscode-extension-qhf | SleepTool: 自主循环等待工具 | OPEN P2 | — |
| vscode-extension-zje | SessionMemory: 会话内笔记服务 | OPEN P2 | — |
| vscode-extension-kqy | ConfigTool: 设置读写工具 | OPEN P2 | — |
| vscode-extension-26q | Kanban 视图：我的作品看板模式 | OPEN P3 | — |
| vscode-extension-0z5 | 画布草图标注工具：iframe 上层 canvas overlay | OPEN P3 | — |
| vscode-extension-f4v | extension.ts 宿主总控继续下沉 | DEFERRED | `.kiro/primers/vscode-extension-f4v.md` |
| vscode-extension-0wm | TeamCreate/TeamDelete/SendMessage: 命名团队管理工具 | DEFERRED | — |

<details>
<summary>已关闭任务（展开查看完整历史）</summary>

| Beads ID | Title |
|----------|-------|
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

</details>

## Stable Capabilities (don't need re-verification)

- Provider chain: Anthropic / OpenAI / OpenAI-compatible / Claude CLI
- Session persistence / export / restore
- MCP runtime (transport / resource / result / name normalization / remote OAuth / prompt commands)
- MCP OAuth refresh hardening (`normalizeOAuthErrorBody`, proactive refresh <=300s, invalid_grant cleanup, transient retry, exported `revokeServerTokens`)
- File tools / command tools / browser tools
- Tasks / background commands
- built-in Review / Verification (/review, /verify)
- Thinking / Effort / Fast mode
- Cron / Scheduler (CronCreate / CronDelete / CronList tools, `.cain/scheduled_tasks.json` persistence, session-only in-memory tasks, 1s scheduler loop)
- Plan Mode V2 (Phase 1: Explore → Phase 2: Design → Phase 3: Present, `src/planMode/planModePrompt.ts`)
- Micro-compact (lightweight tool result clearing before auto-compact, `src/compact/microCompact.ts`)
- Auto-Memory
- LSP phase 1 + partial phase 2
- Worktree phase 1
- Hooks execution chain (user .cain/hooks.json 接入触发链 / PreToolUse 官方别名 / Notification + SessionStart 事件 / WorktreeCreate + WorktreeRemove 20/27 事件已接线)
- Custom Agents registry / Skills registry
- codebase-memory-mcp integration (global install, project indexed as `E-claudecodejingiang-vscode-extension`, `auto_index=true`, repo `AGENTS.md` index-first guidance)
- User modeling
- KainClaw Design (generate / iframe / sliders 右侧抽屉 / canvas toolbar / patch popover 贴近元素 + selector 定位 / 左侧面板 A/B / version history / export HTML+PDF+PPTX / lastOpenedProjectId 跨 session)
- Electron artifact panel persistence (collapse / restore strip / per-session collapsed state / version navigation)
- Image Lab chain (generate / edit / Prompt Library / reference image search)
- Midtai P0 foundations (explicit `midtai:open` routing, library DTO aggregation, deterministic design image replacement IPC)
- Midtai My Works (design-wcard 卡片：gradient thumb / hover lift / dark version badge / source color badges / 图片网格 158px + 设计网格 210px)
- Midtai Canvas Selection (fo7 bridge: 选择模式 crosshair → node panel → Replace 图片 / 去 Image Lab / 从我的作品选择)
- Midtai Canvas Controls (3q7/wnz bridge: 调节 sliders → `__kc_apply_slider_values` iframe bridge / 调节浮层可拖拽 / 导出 HTML+PDF+PPTX 菜单 / 版本历史按当前项目过滤并可恢复)
- KainClaw Design Prompt 质量升级 (Anti-Slop 9 条规则 + DesignDirectionSpec OKLch 调色板 + posture 注入，4 套方向含完整 spec)
- Midtai 设计表单 (输出类型 select + 视觉方向卡片选择器，按输出类型动态渲染，选中值传入 generateDesignWorkbench)
- Midtai Design Skill 扩展 (12 个输出类型，含 8 个新 skill prompt 约束 + renderer 双入口 select + directions fallback)
- Midtai Guide Form + Showcase (静态引导问题表单、模板卡片库、skill/prompt 一键回填、`userContext` 透传链路)
- Midtai Brand Systems (视觉方向 / 品牌参考双 tab、15 个品牌卡片、`brandContext` system prompt 注入)
- Midtai ZIP Export (导出 ZIP，包含 `index.html` 与从 HTML 内抽出的本地 data URL 资源文件)
- Midtai 图像整合 (左侧图像表单 + 比例/数量控件 + 生成预览 shimmer/结果卡片 + 静态提示词库 + 插入到对话)
- Midtai Unified Workbench (p1-p4: 统一工作台 UI / design:switch-project / conversationHistory project 层 / design session 侧栏下沉)
- Local Bridge / Word Add-in (read + write-back + Track Changes + comments)
- Electron i18n (shellStrings covering all surfaces)

## Known Non-Blocking Tail Items

- Deleting the last provider may show "Provider not found" in chat area
- `supabase` MCP may occasionally show `Connection closed`

## Key Risks (still active)

- `src/extension.ts` — still large; **f4v 减债已降级**，等功能速度放缓后再做（频繁加功能期间减债 ROI 低）
- `electron/renderer/index.html` — single-file renderer; prone to inline script regressions
- `src/webviewHtml.ts` — large template string; fragile escaping

## Not Yet Started

- Browser Bridge / Desktop automation / Computer Use
- Full desktop Skills / Agents / Hooks UI
- Full Office chain (Excel/PowerPoint)
- Full Windows release client
- Voice mode / Prompt suggestion / Plugin market

---

*Update this file (test counts + active task) whenever a task closes or baseline changes.*
