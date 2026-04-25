# KainClaw vs 官方 Claude Code 能力对账

## 当前覆盖说明 / Current Override - 2026-04-25

- 本轮已验证：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
  - `npm run check:electron`
- 当前自动化基线：
  - `145` 个测试文件
  - `1001` 个测试通过
- 强规则已收口：凡是 Claude 源码已有的功能、行为、工作流、prompt contract、renderer 行为、tool/runtime 路径或 session 生命周期，必须先读 Claude 源码并按其逻辑复刻基线；只有 Claude 源码没有的 KainClaw 扩展，才按 KainClaw 自研标准开发。
- 本批已同步的 Claude parity 收口项覆盖 `890510a..00076dc`：
  - 文档/规则：Claude 源码优先、handoff、gap analysis、source-reference、UTF-8 without BOM。
  - Renderer：Electron Markdown 与 `/verify` report 渲染改为 Claude-style `marked.lexer()` token baseline，命令和输出按结构化 raw text 渲染。
  - Verification：concrete target gate、问候/空范围 `PARTIAL`、项目证据兜底、语言跟随、diff/provenance/report fence 处理。
  - Tasks/toolRuntime：`local_bash` shell task 语义、Claude-style task id、`TaskGet` / `TaskOutput` / `TaskStop` 合同、非交互 UTF-8 PowerShell 输出、`TaskOutput` abort wait。
  - Compact/session lifecycle：可见 transcript 与模型侧 compact history 分离，workspace root 与 compact metadata 随 runtime state 持久化。
  - TaskStop remote：adapter-backed `remote_agent` 停止后记录 Claude-style `killed`；无 remote stop pathway 时仍明确拒绝。
  - LSP：file-backed 操作按 Claude `LSPTool.validateInput` 做文件预检，`workspaceSymbols` 允许省略/空查询并转发 `query: ""`。
- 本轮 Markdown / `/verify` 渲染修复已按 Claude 源码逻辑对齐：
  - 参考 `E:\claudecodejingiang\src\components\Markdown.tsx`
  - 参考 `E:\claudecodejingiang\src\utils\markdown.ts`
  - Electron renderer 主路径改为 `marked.lexer()` 的块级 token 解析，不再以自研 regex/line parser 作为主逻辑
  - 仍保留原始 HTML 转义、Electron sandbox 与 `nodeIntegration: false`
- `/verify` 报告渲染器已从 Markdown 代码围栏依赖改为结构化报告渲染：
  - 通过 `### Check:` / `Command run:` / `Output observed:` / `Result:` / `VERDICT:` 识别 verification report
  - `Command run` 与 `Output observed` 作为原始文本解析并转义渲染到 `<pre><code>`
  - README 输出、嵌套代码围栏、四反引号围栏不再破坏报告显示
- `marked` 已加入依赖，`build:electron` 会把 `node_modules/marked/lib/marked.umd.js` 复制到 `dist-electron/electron/renderer/vendor/marked.umd.js`。
- `TaskOutput` 阻塞等待后台任务输出时已对齐 Claude `TaskOutputTool` 的取消语义，会把 `ToolContext.abortSignal` 传给 task wait，避免用户取消后继续等待。
- `TaskStop` 对 adapter-backed remote task 已补齐 Claude-style `killed` 终态；没有 stop 通道的 remote task 仍不伪造成功。
- LSP runtime 已补齐 Claude-style file preflight 与 `workspaceSymbols` empty-query 转发；更深 server-manager / provider-availability parity 仍未完成。
- Electron 壳当前已重新接回并验证这些斜杠命令：
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
- Electron 中斜杠命令的识别顺序已先于图片意图判断，避免 `/compact` 等命令被最近图片上下文误判成生图或改图请求。
- `/review`、`/verify` 现在会默认跟随用户语言输出；中文用户会收到中文主体说明，`/verify` 仍保留必要的英文结构标签。
- Electron 的 workspace 与 git repo 语义已经拆开：
  - `workspace` 始终是用户选中的目录
  - `/review`、`/verify` 等依赖 Git 的流程单独解析 inspection repo root
  - inspection repo 解析会在 provider/runtime/MCP tool 上下文构建之前生效
  - `workspace:set` 现在支持清空回 `unset`
- Electron 用户态文案已收口：
  - 不再显示 `Review task saved as ...` / `TaskOutput` / `task_id`
  - workspace badge 直接显示目录名，不再显示 `需确认` 这类技术态标签

## 使用规则

- 这份文档只记录当前代码真实状态与对官方能力的对账结果，不再保留流水账式历史。
- 判断优先级：
  - 先看官方 Claude Code 主线能力是否已经对齐
  - 再看 KainClaw 扩展能力是否独立成立
- 文档保存格式统一为 `UTF-8 without BOM`。

## 当前整体判断

- `vscode-extension/` 仍然是本地验证壳，不是最终产品形态。
- 当前能打包、能验证的是 Electron 内测壳，不是完整 Windows 正式客户端。
- 核心能力仍然必须优先落在 `src/` 的 runtime / service / adapter 层，Electron 只做桌面壳、权限、IPC、UI。
- 项目主线仍是“官方 Claude Code 能力对齐优先，KainClaw 扩展第二”。
- 对官方 Claude Code 已存在的能力，源码逻辑是验收基线；提示词约束或本地猜测不能替代源码 parity。
- 图片、Office、Local Bridge、User Modeling、Auto Skill Generation 都是扩展能力，但不能覆盖官方 parity 主线叙事。

## 能力矩阵

### 官方对齐主线

| 能力 | 当前状态 | 代码证据 | 当前缺口 |
| --- | --- | --- | --- |
| Provider 主链 | 已实现 | `src/agent/providers/anthropicAdapter.ts` `src/agent/providers/openAIAdapter.ts` `src/agent/providers/claudeCliAdapter.ts` | 更广的 provider 生态与更深协议兼容仍可继续补齐 |
| 会话持久化 / 导出 / 恢复 | 已实现 | `src/storage/sessionRepository.ts` `src/sessionListHost.ts` `src/savedSessionHost.ts` | 会话管理 UI 仍可继续打磨 |
| MCP runtime | 已实现 | `src/mcpRuntime.ts` `src/mcpRuntime.helpers.ts` | OAuth / PKCE / prompts / templates parity 未完全收口 |
| 文件 / 命令 / 浏览器工具 | 已实现 | `src/toolRuntime.ts` `src/browserRuntime.ts` | Browser automation parity 仍未完全对齐 |
| Tasks / background command | 部分实现 | `src/tasks/taskRuntime.ts` `src/backgroundTaskHost.ts` `src/backgroundCommandWorker.ts` `src/toolRuntime.ts` | `local_bash`、Claude-style id、Task 工具合同、UTF-8 shell 输出、`TaskOutput` abort wait 和 adapter-backed remote `TaskStop -> killed` 已对齐；完整 hosted / detached background task parity 未完成 |
| built-in Review | 部分实现 | `src/review/runner.ts` `src/agent/built-in/reviewAgent.ts` | ultrareview、远程 review 生命周期仍未完善 |
| built-in Verification | 部分实现 | `src/verification/runner.ts` `src/agent/built-in/verificationAgent.ts` `src/inspectionPromptHost.ts` `src/inspectionWorkspace.ts` | scope gate、workspace evidence fallback、locale、diff/provenance/report fence 已补齐；hosted / detached verification parity 未完成 |
| Plan Mode | 部分实现 | `src/planMode/planMode.ts` `src/planModeHost.ts` `src/planMode/planModePrompt.ts` | 更完整的官方 plan workflow 仍缺 |
| Thinking / Effort / Fast mode | 部分实现 | `src/thinkingEffort/effort.ts` `src/thinkingEffort/thinking.ts` `src/thinkingEffort/fastMode.ts` | phase 2 parity 仍未完全收口 |
| Compact / Auto-compact | 部分实现 | `src/compact/compact.ts` `src/compact/autoCompact.ts` `src/compactHost.ts` `src/storage/sessionRepository.ts` | 可见 transcript 与模型侧 sidecar history 分离已补齐；token / transcript lifecycle 更深 parity 未收尾 |
| Auto-Memory | 部分实现 | `src/autoMemory/paths.ts` `src/autoMemory/extractor.ts` `src/autoMemoryHost.ts` | memory orchestration 更深 parity 未完成 |
| LSP | 部分实现 | `src/lsp/lspRuntime.ts` `src/lsp/formatters.ts` `src/lsp/types.ts` | file-backed preflight 与 `workspaceSymbols` 空查询已按 Claude baseline 补齐；server-manager / provider-availability parity 未完成 |
| Worktree | 部分实现 | `src/worktree/runtime.ts` `src/worktree/types.ts` | 完整 worktree 产品流未完成 |
| Hooks 执行链 | 部分实现 | `src/hooks/hooksExecutor.ts` `src/hooks/hooksTrigger.ts` `src/hooksRegistry.ts` | 触发点接线和产品面仍未完全接齐 |
| Custom Agents | 部分实现 | `src/customAgentsRegistry.ts` `src/promptCommandHost.ts` | wizard、完整执行面、桌面 UI 仍未完成 |
| Skills registry | 部分实现 | `src/skillsRegistry.ts` `src/customSkillsRegistry.ts` `src/promptCommandHost.ts` | 距离官方完整 Skills 体系仍有差距 |
| Slash commands 体系 | 部分实现 | `src/promptCommandHost.ts` `src/extension.ts` | 当前已接 `/commands /agents /skills /hooks /add-dir /files /plan /compact /mcp /memory /todo /tools /review /verify`，但覆盖率仍是子集 |
| Voice mode | 未实现 | 无 | 当前没有对应实现 |
| Prompt suggestion | 未实现 | 无 | 当前没有对应实现 |
| Plugin / Skills 市场 | 未实现 | 无 | 当前没有对应实现 |

### KainClaw 扩展与桌面能力

| 能力 | 当前状态 | 代码证据 | 当前缺口 |
| --- | --- | --- | --- |
| Electron 桌面验证壳 | 已实现 | `electron/main.ts` `electron/preload.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 当前是内测壳，不是完整 Windows 正式客户端 |
| Electron workspace / git inspection 适配 | 已实现 | `electron/ElectronChatPanel.ts` `src/platform/workspaceRootResolver.ts` | submodule / linked worktree / `git` 不可用边界仍需继续压测 |
| Electron inspection 用户态收口 | 已实现 | `src/inspectionPromptHost.ts` `electron/ElectronChatPanel.ts` `electron/renderer/index.html` | 仍可继续减少工程味文案 |
| Electron Markdown / verification report rendering | 已实现 | `electron/renderer/index.html` `electron/rendererMarkdown.test.ts` `package.json` | 已按 Claude `marked.lexer()` token 模型重建主路径；后续若继续改 Markdown 行为，仍必须先对照 Claude 源码 |
| Auto Skill Generation | 已实现 | `src/skills/skillStore.ts` `src/skills/skillDistiller.ts` `src/backgroundTaskHost.ts` | 产品面与治理面仍可继续收口 |
| User Modeling | 已实现 | `src/userModel/profileStore.ts` `src/userModel/profileDistiller.ts` | UI 管理面仍未完整 |
| 图片聊天工作流 | 已实现 | `src/imageGeneration/imageWorkflowOrchestrator.ts` `src/imageGeneration/chatPromptIntent.ts` `electron/ElectronChatPanel.ts` | 当前已迁到聊天主链，但仍是扩展能力；意图分流已修复三处 bug（2026-04-25，Claude）：附件+编辑意图误判为生成、生成与问句优先级倒置、确认语误触发编辑 |
| 图片模型配置 | 已实现 | `src/storage/settingsRepository.ts` `src/imageGeneration/openAIImageClient.ts` | UI 仍可继续收口 |
| Prompt Library | 已实现 | `src/imageGeneration/promptLibraryRepository.ts` `src/imageGeneration/promptLibraryBuiltins.ts` | 后续可继续做资产治理与展示优化 |
| 找参考图 | 部分实现 | `src/imageGeneration/imageMaterialSearch.ts` `src/imageGeneration/imageWorkflowOrchestrator.ts` | 当前仍是过渡方案，长期目标仍是网页资料搜索后再抽视觉线索 / 可用图片 |
| 图片结果本地化持久化 | 已实现 | `src/imageGeneration/imageLabGalleryStore.ts` `electron/ElectronChatPanel.ts` | 缓存与清理策略仍可继续优化 |
| DesktopRuntimeServices 注入层 | 部分实现 | `src/platform/desktopRuntimeServices.ts` `electron/main.ts` | 当前 Electron 真正接上的仅 `localBridgeRuntime` |
| Local Bridge runtime | 已实现 | `src/localBridge/localBridgeRuntime.ts` `src/localBridge/localBridgeProxy.ts` `src/localBridge/localBridgeSession.ts` | token 生命周期与更广业务面未完成 |
| Word Add-in 最小链路 | 部分实现 | `office-addin/word/manifest.xml` `src/officeBridge/bridgeClient.ts` `src/officeBridge/wordQuestionAnswer.ts` | 当前只到只读问答 / 选区上下文 / citation 命中，完整 Office 业务流未完成 |
| Browser Bridge runtime | 未实现 | `src/platform/browserBridgeRuntime.ts` | 当前仅接口层，没有主流程实现 |
| Desktop automation / Computer Use | 未实现 | `src/platform/desktopAutomationRuntime.ts` | 当前仅接口层，没有主流程实现 |
| Scheduler / Cron runtime | 未实现 | `src/platform/schedulerRuntime.ts` | 当前仅接口层，没有主流程实现 |
| 企业 MDM / managed settings | 明确不做 | 无 | 当前阶段明确排除 |

## 当前代码状态补充说明

### 已经比较稳定的主线

- 核心 AI/runtime 能力已经稳定存在：Provider、会话持久化、MCP runtime、文件/命令/浏览器工具、Tasks/background command、Review/Verification、Thinking/Effort/Fast、Compact/Auto-Memory、LSP、Worktree、Hooks、Custom Agents、Skills registry。
- Electron 现在应被准确描述为“可打包、可验证的桌面内测壳”，而不是完整正式客户端。
- Electron Markdown 与 `/verify` report 渲染已从自研 regex/line parser 收口到 Claude-style `marked.lexer()` token 基线，并对 verification 的 command/output 使用结构化 raw text 渲染。
- LSP runtime 已按 Claude `LSPTool.validateInput` 补齐文件预检，并允许 `workspaceSymbols` 省略/空查询。
- 图片主链已经从旧 `Image Lab` 页面迁到聊天流；旧 `Image Lab` 更接近底层承载壳和历史 UI，而不是产品主入口。
- Prompt Library 已经升级成 `src/` 数据层驱动，而不再只是 renderer 原型。
- `Local Bridge` 已从纯规划进入最小可运行实现阶段；Word Add-in 只读 MVP 也已落地。

### 当前最大剩余风险区

- `src/extension.ts` 仍是高风险宿主入口，虽然已经抽出大量 host/helper，但总控逻辑依然偏厚。
- `electron/renderer/index.html` 与 `electron/ElectronChatPanel.ts` 仍是验证壳层，不应继续堆新的核心业务逻辑。
- `DesktopRuntimeServices` 里真正接上的 runtime 仍然太少，`desktopAutomationRuntime / browserBridgeRuntime / schedulerRuntime` 还停留在边界层。
- 当前“找参考图”虽然已切到更符合中国大陆用户环境的搜索链，但仍是过渡态，不是最终资料搜索编排层。

## 当前优先顺序

1. 继续把宿主总控逻辑从 `extension.ts` 往 host / runtime / adapter 下沉
2. 继续收桌面壳的真实可用子集，不虚报未接好的能力
3. 继续补 `/review`、`/verify`、任务与工具链相关 parity 的边界测试
4. 继续维持三份主文档为“当前状态”写法，不再回到流水账

## 相关规格与参考路径

### 主规格与参考

- 主产品规格：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\v1-product-spec.md`
- 官方源码能力索引：
  - `E:\claudecodejingiang\vscode-extension\.kiro\source-reference.md`
- 文档恢复草稿：
  - `E:\claudecodejingiang\vscode-extension\.kiro\recovery-draft-2026-04-24.md`
  - 仅用于回收旧文档主体与历史表述，不作为当前状态真源

### Phase 3 / Phase 4 对应规格

- Computer Use / Browser Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\computer-use-browser-bridge.md`
- Office Add-in / Local Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\office-addin-ecosystem.md`
- Hooks：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-hooks-execution-chain.md`
- Custom Agents：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-custom-agents-wizard.md`
- Cron / Scheduler：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p3-cron-scheduled-tasks.md`
- 跨会话搜索：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x01-cross-session-search.md`
- User Modeling：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x02-user-modeling.md`
- Message Gateway：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\x03-message-gateway.md`
- Companion：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f09-companion.md`
- Auto Skill Generation：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\f11-auto-skill-generation.md`
- KainClaw Design：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\kainclaw-design.md`
- Worker 权限边界：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\p05-worker-permissions.md`
