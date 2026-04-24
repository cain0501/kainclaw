# KainClaw vs 官方 Claude Code 能力对账

更新时间：2026-04-24

## 使用规则

- 本文件只承担一件事：记录“当前代码状态”与“官方 Claude Code 目标能力”的对账结果。
- 只维护状态、证据、缺口和阶段优先级，不再追加流水账式变更历史。
- 任何扩展能力都必须明确标注为扩展，不得覆盖官方 parity 主线。
- 统一以 UTF-8 without BOM 保存。

状态定义：

- `已实现`：当前项目内已有可用实现，可作为真实能力登记。
- `部分实现`：已有骨架或子集，但距离目标仍有明显差距。
- `未实现`：当前没有对应实现。
- `明确不做`：当前阶段明确排除，不进入近期对账范围。

## 当前总体判断

- 当前项目已经是一个可用的本地 AI 助手验证壳，但还不是最终交付形态。
- `vscode-extension/` 仍是本地验证壳；最终交付目标仍然是 Windows 程序。
- 当前可打包、可验证的是 Electron 内测壳，不是完整功能 Windows 正式客户端。
- 当前主线仍然是“官方 Claude Code 能力对齐优先，Cain 扩展能力第二”。
- 核心能力必须继续优先落在 `src/` runtime / service / adapter；Electron 只做桌面壳、权限、IPC、UI。
- 图像、Office、Local Bridge、User Modeling、Auto Skill Generation 都是重要扩展面，但不能在文档叙事里反客为主。
- 当前验证基线登记：
  - `137` 个测试文件
  - `891` 个测试通过
  - 通过命令：`npm test`、`npm run check`、`npm run build`、`npm run build:electron`

## 能力矩阵

### 官方对齐主线

| 能力 | 当前状态 | 代码证据 | 当前缺口 |
| --- | --- | --- | --- |
| Provider 主链 | 已实现 | `src/agent/providers/anthropicAdapter.ts` `src/agent/providers/openAIAdapter.ts` `src/agent/providers/claudeCliAdapter.ts` | 更广的 provider 生态与更深协议兼容仍可继续补齐 |
| 会话持久化 / 导出 / 恢复 | 已实现 | `src/storage/sessionRepository.ts` `src/sessionListHost.ts` `src/savedSessionHost.ts` | 会话管理 UI 仍可继续打磨 |
| MCP runtime | 已实现 | `src/mcpRuntime.ts` `src/mcpRuntime.helpers.ts` | OAuth / PKCE / prompts / templates parity 未完成 |
| 文件工具 / 命令工具 / 浏览器工具 | 已实现 | `src/toolRuntime.ts` `src/browserRuntime.ts` | Browser automation parity 仍未完整对齐 |
| Tasks / background command | 部分实现 | `src/tasks/taskRuntime.ts` `src/backgroundTaskHost.ts` `src/backgroundCommandWorker.ts` | remote / detached background task parity 未收尾 |
| built-in Review | 部分实现 | `src/review/runner.ts` `src/agent/built-in/reviewAgent.ts` | ultrareview、远端 review 生命周期仍未完善 |
| built-in Verification | 部分实现 | `src/verification/runner.ts` `src/agent/built-in/verificationAgent.ts` | hosted / detached verification parity 未完成 |
| Plan Mode | 部分实现 | `src/planMode/planMode.ts` `src/planModeHost.ts` `src/planMode/planModePrompt.ts` | 更完整的官方 plan workflow 仍缺 |
| Thinking / Effort / Fast mode | 部分实现 | `src/thinkingEffort/effort.ts` `src/thinkingEffort/thinking.ts` `src/thinkingEffort/fastMode.ts` | 更深 phase 2 parity 仍未完成 |
| Compact / Auto-compact | 部分实现 | `src/compact/compact.ts` `src/compact/autoCompact.ts` `src/compactHost.ts` | transcript / token lifecycle 更深对齐仍未完成 |
| Auto-Memory | 部分实现 | `src/autoMemory/paths.ts` `src/autoMemory/extractor.ts` `src/autoMemoryHost.ts` | memory orchestration 更深对齐仍未完成 |
| LSP | 部分实现 | `src/lsp/lspRuntime.ts` `src/lsp/formatters.ts` `src/lsp/types.ts` | server-manager / provider-availability parity 未完成 |
| Worktree | 部分实现 | `src/worktree/runtime.ts` `src/worktree/types.ts` | 完整 worktree 产品流未完成 |
| Hooks 执行链 | 部分实现 | `src/hooks/hooksExecutor.ts` `src/hooks/hooksTrigger.ts` `src/hooksRegistry.ts` | 触发点接线和产品面仍未完全接齐 |
| Custom Agents | 部分实现 | `src/customAgentsRegistry.ts` `src/promptCommandHost.ts` | wizard、完整执行面、桌面 UI 仍未完成 |
| Skills registry | 部分实现 | `src/skillsRegistry.ts` `src/customSkillsRegistry.ts` `src/promptCommandHost.ts` | 距离官方完整 Skills 体系仍有差距 |
| Slash commands 体系 | 部分实现 | `src/promptCommandHost.ts` `src/extension.ts` | 当前已注册 `/commands /agents /skills /hooks /add-dir /files /plan /compact /mcp /memory /todo /tools /review /verify`，但覆盖率仍低 |
| Voice mode | 未实现 | 无 | 当前没有对应实现 |
| Prompt suggestion | 未实现 | 无 | 当前没有对应实现 |
| Plugin / Skills 市场 | 未实现 | 无 | 当前没有对应实现 |

### Cain 扩展与桌面能力

| 能力 | 当前状态 | 代码证据 | 当前缺口 |
| --- | --- | --- | --- |
| Electron 桌面验证壳 | 已实现 | `electron/main.ts` `electron/preload.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 当前是内测壳，不是完整 Windows 正式客户端 |
| Auto Skill Generation | 已实现 | `src/skills/skillStore.ts` `src/skills/skillDistiller.ts` `src/backgroundTaskHost.ts` | 产品面和治理面仍可继续收口 |
| User Modeling | 已实现 | `src/userModel/profileStore.ts` `src/userModel/profileDistiller.ts` | UI 管理面仍未完整 |
| 图像聊天工作流 | 已实现 | `src/imageGeneration/imageWorkflowOrchestrator.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 当前已移到聊天主链，但仍是扩展面，不是主核心 |
| 图像模型配置 | 已实现 | `src/storage/settingsRepository.ts` `src/imageGeneration/openAIImageClient.ts` `electron/renderer/index.html` | UI 仍可继续收口 |
| Prompt Library | 已实现 | `src/imageGeneration/promptLibraryRepository.ts` `src/imageGeneration/promptLibraryBuiltins.ts` | 后续可继续做资产治理与展示体验 |
| 参考图搜索 | 部分实现 | `src/imageGeneration/imageMaterialSearch.ts` `src/imageGeneration/imageWorkflowOrchestrator.ts` | 当前是“两段式任务准备 + 百度图片抓取”的过渡链，长期目标仍是网页资料搜索后抽视觉线索/可用图片 |
| 图像结果本地化持久化 | 已实现 | `src/imageGeneration/imageLabGalleryStore.ts` `electron/ElectronChatPanel.ts` | 缓存与清理策略仍可继续优化 |
| DesktopRuntimeServices 注入层 | 部分实现 | `src/platform/desktopRuntimeServices.ts` `electron/main.ts` | 当前 Electron 真正接上的只有 `localBridgeRuntime` |
| Local Bridge runtime | 已实现 | `src/localBridge/localBridgeRuntime.ts` `src/localBridge/localBridgeProxy.ts` `src/localBridge/localBridgeSession.ts` | 最小闭环已落地，完整 token 生命周期与更广业务面未完成 |
| Word Add-in 最小链路 | 部分实现 | `office-addin/word/manifest.xml` `src/officeBridge/bridgeClient.ts` `src/officeBridge/wordQuestionAnswer.ts` | 当前只到只读问答 / 选区上下文 / citation 命中，完整 Office 业务链未完成 |
| Browser Bridge runtime | 未实现 | `src/platform/browserBridgeRuntime.ts` | 当前只有接口，没有主流程实现 |
| Desktop automation / Computer Use | 未实现 | `src/platform/desktopAutomationRuntime.ts` | 当前只有接口，没有主流程实现 |
| Scheduler / Cron runtime | 未实现 | `src/platform/schedulerRuntime.ts` | 当前只有接口，没有主流程实现 |
| 企业 MDM / managed settings | 明确不做 | 无 | 当前阶段明确排除 |

## 当前代码状态的补充说明

### 已经明显稳定下来的主线

- 核心 AI/runtime 能力已经稳定存在：Provider、会话持久化、MCP runtime、文件/命令/浏览器工具、Tasks/background command、Review/Verification、Thinking/Effort/Fast、Compact/Auto-Memory、LSP、Worktree、Hooks、Custom Agents、Skills registry。
- Electron 现在应被准确描述为“可打包、可验证的桌面内测壳”，而不是完整客户端。
- 图像主链已经从旧 `Image Lab` 页面迁到聊天流；旧 `Image Lab` 更接近底层承载壳和历史 UI，而不是产品主入口。
- Prompt Library 已经升级为 `src/` 数据层驱动，不再只是 renderer 原型。
- `Local Bridge` 已经从纯规划进入最小可运行实现阶段，Word Add-in 只读 MVP 主链也已有落地文件与代码路径。
- 2026-04-15 到 2026-04-20 的官方 parity 收尾主线已经比较清楚：
  - `tasks / toolRuntime`
  - `verification`
  - `compact`
  - `lsp / worktree`
  - `extension.ts / handlePrompt` 宿主减债

### 当前最大剩余风险区

- `src/extension.ts` 仍是高风险宿主入口，虽然已经抽出大量 host/helper，但总控逻辑仍厚。
- `electron/renderer/index.html` 与 `electron/ElectronChatPanel.ts` 仍然是验证壳层，不应继续堆新的核心业务逻辑。
- `DesktopRuntimeServices` 里真正接上的 runtime 仍然太少，`desktopAutomationRuntime / browserBridgeRuntime / schedulerRuntime` 还停留在边界层。
- 当前“找参考图”虽然已从国外图库 API 切走，改为更符合中国大陆用户环境的搜索链，但仍是过渡态，不是最终形态。

## 当前优先顺序（Phase 2 收尾）

1. `tasks / toolRuntime` 收尾
2. Verification Agent 收尾
3. Compact 收尾
4. LSP / Worktree 更深 parity
5. `src/extension.ts` 宿主减债继续下沉到 host / runtime / adapter

## Phase 3 功能积压（当前 Phase 2 完成后开始）

### 第一梯队：核心扩展性骨架

- 斜杠命令体系扩展：在现有注册表骨架上继续补命令覆盖率。
- Skills 内置技能体系：完善 SkillTool、内置 skill 注册与桌面执行面。
- Hooks 自动化框架：继续补 toolRuntime / promptCommandHost / promptTurnHost 触发点。
- Custom Agents：补 wizard、执行通路、管理面。

### 第二梯队：用户体验提升

- Memory 管理 UI
- Context 管理 UI
- Prompt suggestion
- TodoWriteTool 的完整产品流

### 第三梯队：高级能力

- Cron / Scheduler
- Voice mode
- WorkflowTool
- REPL Tool
- ToolSearchTool 深化

### 第四梯队：平台级能力（长期）

- Plugin / Skills 市场
- Advisor 双模型通道
- 诊断与使用命令（`/doctor`、`/usage`、`/cost`、`/stats` 等）
- Notebook 编辑
- Bridge / 远程控制

### 明确不在 Phase 3 范围内

- 企业 MDM / managed settings

## Phase 4 功能积压（Windows 客户端完成后开始）

### Office 生态（Word / Excel / PowerPoint Add-in）

- Windows 客户端 `Local Bridge` 完整产品化
- Word Add-in MVP 完整闭环
- KainClaw 设置面里的 Office 安装与状态入口
- Word Add-in 完整编辑流
- Excel Add-in
- PowerPoint Add-in
- 跨应用上下文共享
- AI 视觉设计生成等长期探索型扩展

## Latest Sync - 2026-04-24

- 当前文档主体恢复到“官方 parity 主线优先”的写法，不再把图片能力误写成项目主核心。
- 验证基线登记更新为：`137` 个测试文件、`891` 个测试通过；`npm test`、`npm run check`、`npm run build`、`npm run build:electron` 为当前通过命令。
- `Local Bridge` 已从纯规划改写为“最小可运行实现已落地，完整业务链未完成”。
- `Word Add-in` 已从纯规划改写为“只读 MVP 主链推进中”。
- 图像链路已明确记录为聊天主链扩展能力，包含图像模型多配置、Prompt Library 数据层、结果本地持久化、参考图搜索过渡链等当前事实。
