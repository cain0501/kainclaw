# Current State — KainClaw vscode-extension

> **Single source of truth for project-level current state.**
> Update this file after every verified checkpoint. Do NOT scatter state across CLAUDE_HANDOFF.md and implementation-memory.md.

## Test Baseline

| Metric | Value | Last Updated |
|--------|-------|--------------|
| Test files | 170 | 2026-05-06 |
| Tests passing | 1322 | 2026-05-06 |
| Last verified commit | see `git log --oneline -1` | — |

**Required passing commands:**
```bash
npm test
npm run check
npm run build
npm run build:electron   # only when Electron behavior changed
```

## Active Tasks

| Beads ID | Title | Status | Primer |
|----------|-------|--------|--------|
| vscode-extension-f4v | extension.ts 宿主总控继续下沉 | IN_PROGRESS | `.kiro/primers/vscode-extension-f4v.md` |
| vscode-extension-lca | Hooks: 用户配置接入触发链 | OPEN | `.kiro/primers/vscode-extension-lca.md` |
| vscode-extension-vwq | Hooks: 官方事件名兼容 + Notification/SessionStart | OPEN | `.kiro/primers/vscode-extension-vwq.md` |
| vscode-extension-pnz | Fast mode: state persistence | OPEN | `.kiro/primers/vscode-extension-pnz.md` |
| vscode-extension-e0i | Midtai 图像整合：左侧表单 + 生成预览 + 提示词库 | ✓ CLOSED | — |
| vscode-extension-0pq | ~~Design Home UI（阶段 1）~~ | ✓ CLOSED | — |
| vscode-extension-0pq-2 | Tweaks 右侧抽屉 | ✓ CLOSED | — |
| vscode-extension-w0i | design_versions 缺列迁移补丁 | ✓ CLOSED | — |
| vscode-extension-0pq-3 | 左侧面板阶段 A/B | ✓ CLOSED | — |
| vscode-extension-0pq-4 | Patch Popover 贴近元素 | ✓ CLOSED | — |
| vscode-extension-ged | Canvas Toolbar（View/Select/Tweaks）| ✓ CLOSED | — |
| vscode-extension-yi9 | lastOpenedDesignProjectId 跨 session | ✓ CLOSED | — |
| vscode-extension-j31 | LLM 意图路由器超时 800ms → 5000ms | ✓ CLOSED | — |
| vscode-extension-bdi | Design 导出全部失效（HTML/PDF/PPTX） | ✓ CLOSED | — |
| vscode-extension-nce | 首屏设计入口默认显示 Design Home | ✓ CLOSED | — |
| vscode-extension-a4o | Design 项目删除 + 重命名 | ✓ CLOSED | — |
| vscode-extension-pmh | Design Home UI 升级（缩略图+网格） | ✓ CLOSED | — |
| vscode-extension-175 | Design 生成流式输出（onToken + shimmer）| ✓ CLOSED | — |
| vscode-extension-e38 | My Works 真实数据接入 | ✓ CLOSED | — |
| vscode-extension-o6a | My Works UI 对齐设计稿（design-wcard 样式）| ✓ CLOSED | — |
| vscode-extension-fo7 | Midtai 画布选择模式 + Replace 流 | ✓ CLOSED | — |
| vscode-extension-aw5 | Design Prompt 质量升级（Anti-Slop + Direction Spec）| ✓ CLOSED | — |
| vscode-extension-mjj | 中台设计表单：输出类型 + 视觉方向选择器 | ✓ CLOSED | — |

**→ Design UX 全部已完成。下一批由 Claude PM 按需拆解。**

## Stable Capabilities (don't need re-verification)

- Provider chain: Anthropic / OpenAI / OpenAI-compatible / Claude CLI
- Session persistence / export / restore
- MCP runtime (transport / resource / result / name normalization / remote OAuth / prompt commands)
- File tools / command tools / browser tools
- Tasks / background commands
- built-in Review / Verification (/review, /verify)
- Thinking / Effort / Fast mode
- Compact / Auto-compact
- Auto-Memory
- LSP phase 1 + partial phase 2
- Worktree phase 1
- Hooks execution chain
- Custom Agents registry / Skills registry
- User modeling
- KainClaw Design (generate / iframe / sliders 右侧抽屉 / canvas toolbar / patch popover 贴近元素 + selector 定位 / 左侧面板 A/B / version history / export HTML+PDF+PPTX / lastOpenedProjectId 跨 session)
- Electron artifact panel persistence (collapse / restore strip / per-session collapsed state / version navigation)
- Image Lab chain (generate / edit / Prompt Library / reference image search)
- Midtai P0 foundations (explicit `midtai:open` routing, library DTO aggregation, deterministic design image replacement IPC)
- Midtai My Works (design-wcard 卡片：gradient thumb / hover lift / dark version badge / source color badges / 图片网格 158px + 设计网格 210px)
- Midtai Canvas Selection (fo7 bridge: 选择模式 crosshair → node panel → Replace 图片 / 去 Image Lab / 从我的作品选择)
- KainClaw Design Prompt 质量升级 (Anti-Slop 9 条规则 + DesignDirectionSpec OKLch 调色板 + posture 注入，4 套方向含完整 spec)
- Midtai 设计表单 (输出类型 select + 视觉方向卡片选择器，按输出类型动态渲染，选中值传入 generateDesignWorkbench)
- Midtai 图像整合 (左侧图像表单 + 比例/数量控件 + 生成预览 shimmer/结果卡片 + 静态提示词库 + 插入到对话)
- Local Bridge / Word Add-in (read + write-back + Track Changes + comments)
- Electron i18n (shellStrings covering all surfaces)

## Known Non-Blocking Tail Items

- Deleting the last provider may show "Provider not found" in chat area
- `supabase` MCP may occasionally show `Connection closed`

## Key Risks (still active)

- `src/extension.ts` — still large; reduction is ongoing via vscode-extension-f4v
- `electron/renderer/index.html` — single-file renderer; prone to inline script regressions
- `src/webviewHtml.ts` — large template string; fragile escaping

## Not Yet Started

- Browser Bridge / Desktop automation / Computer Use
- Scheduler / Cron
- Full desktop Skills / Agents / Hooks UI
- Full Office chain (Excel/PowerPoint)
- Full Windows release client
- Voice mode / Prompt suggestion / Plugin market

---

*Update this file (test counts + active task) whenever a task closes or baseline changes.*
