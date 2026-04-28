# Claude Handoff / Claude 交接说明

## 当前覆盖说明 / Current Override - 2026-04-28

- 2026-04-28 installed-skills parity increment:
  - Primary installed-skill roots are now `~/.kainclaw/skills` and `.kainclaw/skills`, with `~/.claude/skills` and `.claude/skills` kept as compatibility roots.
  - Installed-skill prompt execution now covers argument substitution, `allowed-tools`, model/effort overrides, `context=fork`, and shell metadata.
  - Installed-skill shell expansion now supports the Claude-style `!` / ` ```! ` patterns through the existing PowerShell-backed execution path; `shell: bash` is rejected explicitly instead of silently falling back.
  - Installed-skill hooks now support prompt / command / http / agent definitions, tool-event matcher filtering, and session-scoped persistence for the active conversation.
  - The Electron desktop shell now also preserves those installed-skill hooks across follow-up prompts in the same conversation, instead of dropping them after the initial slash-command invocation.
  - Remaining meaningful gaps on the installed-skills line: no true model-side `SkillTool` gate for `disable-model-invocation` yet, and fuller Claude command-object parity is still missing.
  - Current automated baseline after this slice: `152` test files, `1121` tests passed.

- 本批 Claude parity 收口后的验证基线：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
  - `npm run check:electron`
  - `152` 个测试文件
  - `1121` 个测试通过
- 最近几组 `extension.ts` 宿主减债也已同步收口：
  - `extensionPromptRequestParts`
  - `sessionPanelActions`
  - `readySequenceRunner`
  - `settingsPanelActions`
  - `companionBindings`
  - `quickActionBindings`
  - `licenseHostBindings`
  - `workspaceStatusController`
  - `webviewStateBindings / streamingStateBindings`
  - `savedSessionActivationBindings`
  - 这些都只是在 KainClaw 的 VS Code / Electron 宿主装配层继续下沉，不改 Claude 覆盖的 runtime / prompt / tool / session 语义
- 本轮新增收口项（本地 detached hosted review 适配）：
  - `/ultrareview` 已接进 VS Code 与 Electron 的 prompt command 链路。
  - 当前行为仍按 Claude `/ultrareview` + `RemoteAgentTask` 生命周期设计，但由于本仓没有 CCR / cloud backend，传输层适配为 detached `Claude CLI` review worker。
  - hosted review 现在会立即返回 task id / output path，并在完成后通过 background notification 回流完整 findings，不再只给截断预览。
  - detached hosted review 已接入 stop 路径；但真正的 cloud remote session parity 仍未完成。
- 本轮新增收口项（hosted verification parity）：
  - `/ultraverify` 已按 Claude hosted verification / `RemoteAgentTask` 用户语义接进 Electron，本地传输层仍是 detached `Claude CLI` verification worker。
  - 启动后会先回显 task id / output path，聊天区保持 waiting / background 状态，完成后自动回流完整 verification report 与 `VERDICT`。
  - 用户在运行中手动 stop 时，会进入 stopped / cancelled 路径，而不是把任务误判为自然完成。
- 本轮新增收口项（provider runtime identity + tool assembly parity）：
  - 身份层固定为 `我是 KainClaw，一个多功能的AI助手。`，当前 provider / model 信息由宿主注入 runtime identity note，不再让模型自由脑补自己是 Claude / GPT / DeepSeek。
  - `claude-cli` 按高可信度说明；官方 `Anthropic / OpenAI` 按当前配置的 provider + model 说明；`openai-compatible` / 第三方 gateway 会显式提示“当前配置如此，但真实上游模型可能被代理覆盖”。
  - 第三方 `Anthropic` / `DeepSeek` 路径的工具池已按 Claude `src/cli/print.ts` 的 `uniqBy(name)` 逻辑去重，避免严格上游因重复工具名直接报 `Tool names must be unique.`。
- 用户硬规则已收口并写入项目记忆与主文档：
  - 只要本地 Claude 源码已经实现某个功能、行为、工作流、工具链、renderer 路径或 session 生命周期，实施和调试都必须先读取 Claude 源码，并按它的端到端链路复刻 baseline。
  - 不允许先靠本地猜测、规避式 workaround、提示词补丁或平行自研实现去“试错”，再事后回头对齐源码。
  - 只有 Claude 源码没有覆盖的能力，才按 KainClaw 自己的标准独立设计和实现。
- 本批新增收口项（`79a8f82`、`022c0ef`）：
  - `79a8f82`：LSP formatter malformed 响应防御、`normalizeLspOperation`（documentSymbol/workspaceSymbol 官方单数名）、provider unavailable 与空结果区分、`getBuiltInToolDefinitions({ lspAvailable })` 替换静态 `toolDefinitions`、ToolSearch 搜索合同按 Claude ToolSearchTool 源码收口。
  - `022c0ef`：Word Add-in 写回能力——`documentEditor.ts`（replaceSelection / Track Changes）、`commentHandler.ts`（批注读取与 AI 处理）、taskpane 三标签页（问答 / 编辑 / 批注）、manifest.xml VersionOverrides 功能区按钮、webpack + tsconfig 打包骨架。（2026-04-27，Claude）
- 本批已同步的收口项覆盖 `890510a..00076dc`，不只包含最后一次 `TaskOutput` 修复：
  - `890510a`：同步 Claude 源码优先规则、handoff、gap analysis、source-reference 与编码约束。
  - `b95c258`：Electron Markdown / `/verify` report 渲染按 Claude `marked.lexer()` token 模型重建，并 vendor `marked` 运行时。
  - `d235163`：`/verify` 增加 concrete target gate、问候/空范围 `PARTIAL`、工作区项目证据兜底、语言跟随、diff/provenance/report fence 处理。
  - `d1fc143`：background task / toolRuntime 对齐 Claude shell task 语义，包括 `local_bash`、Claude-style id、`TaskGet` / `TaskOutput` 输入合同、`TaskStop` 缺失/不支持行为、非交互 UTF-8 PowerShell 输出。
  - `fcea9f4`：compact/session lifecycle 对齐，保留可见 transcript，把模型侧 compact 历史放进 sidecar runtime state，并持久化 workspace / compact metadata。
  - `00076dc`：`TaskOutput` 阻塞等待传递 `ToolContext.abortSignal`，用户取消后不继续挂住 task wait。
- 本地后续 Claude parity 收口项也已登记到本文档：
  - `TaskStop` 对 adapter-backed `remote_agent` 会记录 Claude-style `killed` 终态；缺少 remote stop pathway 时仍拒绝，不伪造停止成功。
  - LSP file-backed 操作按 Claude `LSPTool.validateInput` 做入口预检：缺失文件、非普通文件、超过 10MB 直接失败；UNC 路径跳过本地 `stat` probe。
  - `workspaceSymbols` 允许省略或传空查询，并向 VS Code provider 转发 `query: ""`，不再被本地 schema 误拦截。
  - LSP provider availability：VS Code provider 返回 `undefined` 时按 Claude 的 no-server/no-provider 状态返回，不再混成空结果；没有 LSP runtime 时不再暴露 `LSP` 工具。
  - LSP operation naming：工具入口已接受 Claude 官方单数名 `documentSymbol` / `workspaceSymbol`，并在 KainClaw 适配层归一化到现有内部 runtime 操作 `documentSymbols` / `workspaceSymbols`。
  - LSP provider response hardening：对 provider 返回缺失 URI、range、location、call target 的 malformed 结果做过滤或 `<unknown location>` 降级，避免 gitignored 过滤和 formatter 直接崩溃。
  - ToolSearchTool：按 Claude `ToolSearchTool` 搜索合同补齐 `select:ToolA,ToolB`、裸工具名精确选择、`mcp__server` 前缀、`+required optional` 必选词搜索，以及 `max_results` 输入别名。
  - Task tool aliases：按 Claude `TaskOutputTool` / `TaskStopTool` 源码补齐 deprecated aliases，`AgentOutputTool` / `BashOutputTool` 归一到 `TaskOutput`，`KillShell` 归一到 `TaskStop`；ToolSearch 也会把这些旧名解析到 canonical 工具。
  - MCP transport parity：按 Claude MCP 源码补齐 `type: "http"`（Streamable HTTP）与 `type: "sse"`（SSE）配置语义；SSE 不再误走 Streamable HTTP；未知远端 transport（如 `ws`）会被忽略；远端认证失败归类为 `needs-auth`。
  - MCP auth/resource parity：`needs-auth` 远端 server 会暴露 Claude-style `mcp__<server>__authenticate` placeholder；当前本地 OAuth browser flow 仍未接线，placeholder 返回可执行的 KainClaw 配置指引。`ReadMcpResourceTool` 访问已连接但不支持 resources 的 server 时返回明确“不支持 resources”，不会把 server 标记失败。
  - MCP result/name parity：`isError: true` 的 MCP tool result 会抛工具错误，不再当作成功输出，也不会把 server connection 标记失败；`toolResult`、`structuredContent`、`content[]` 按 Claude 优先级格式化。MCP 对外工具名已使用 Claude-compatible `normalizeNameForMCP` 安全化，内部调用仍保留原始 server/tool 名，resource read 可用 normalized server name 映射回原配置名。
  - MCP 本轮定向验证：`npm test -- --run src/mcpRuntime.test.ts src/mcpRuntime.helpers.test.ts`（25 tests passed）、`npm test -- --run src/toolRuntime.test.ts`（90 tests passed）、`npm run check`、`npm run build`、`git diff --check -- src/mcpRuntime.ts src/mcpRuntime.test.ts src/mcpRuntime.helpers.test.ts`。
  - MCP remote OAuth parity：按 Claude `OAuthClientProvider + localhost callback + PKCE` 链路补齐远端 `http` / `sse` MCP browser OAuth；VS Code 与 Electron host 都已接入 `openExternal`、token/client/discovery state 持久化，以及 auth 后工具缓存失效。`oauth.xaa` 仍明确未支持。
  - MCP prompt command parity：按 Claude `fetchCommandsForClient()` 语义补齐 `mcp__<server>__<prompt>` prompt command 暴露、`/mcp prompts` 检视，以及 prompt command 展开后继续进入正常模型回合；不再把 Claude prompt surface 误做成另一套本地工具。
  - MCP invocation hardening：执行层已兼容模型常见的 MCP 工具名变形，例如把 `mcp__notion__authenticate` 写成 `mcp_notion_authenticate`，或把 `notion-get-users` 写成 `notion_get_users`，统一归一化回 canonical 工具名执行。
  - Electron transcript parity：按 Claude `tool_use / tool_result` 可见性补回 Electron transcript。用户现在能直接看到真实 MCP 工具名、输入参数和原始 tool result，不再只剩 assistant 事后猜测原因。
  - 手测证据：Notion MCP 在 Electron 中已完成一次真实 browser OAuth 回环（`localhost:3118/callback`），`/mcp` 显示 `connected`，`/mcp call mcp__notion__notion-get-users {"page_size":5}` 返回真实用户列表；自然语言路径也已能展示真实 `tool_use / tool_result`，不再盲猜。
- 强实现规则已经生效：
  - 如果本地 Claude Code 源码已经包含目标功能、行为、工作流、prompt contract、renderer 行为、tool/runtime 路径或 session 生命周期，必须先读取该源码，并把源码逻辑作为实现 baseline 复刻。
  - KainClaw 自研标准只用于 Claude 源码没有覆盖的能力，或用于 Claude-compatible baseline 之上的薄适配层。
- Electron Markdown 渲染已重新按 Claude 源码对齐：
  - `E:\claudecodejingiang\src\components\Markdown.tsx`
  - `E:\claudecodejingiang\src\utils\markdown.ts`
  - 渲染器主路径现在使用 `marked.lexer()` 的块级 token 解析，不再把自研 regex/line parser 作为主逻辑。
  - 原始 HTML 仍然会被转义；Electron 仍保持 `sandbox: true` 和 `nodeIntegration: false`。
- `/verify` 报告渲染不再依赖 Markdown 代码围栏是否完整：
  - 通过 `### Check:`、`Command run:`、`Output observed:`、`Result:`、`VERDICT:` 这些必需标签识别报告。
  - `Command run` 和 `Output observed` 会作为结构化原始文本解析，并通过转义后的 `<pre><code>` 渲染。
  - README 输出、嵌套代码围栏、四反引号围栏都会保持字面量显示，不再打断报告结构。
- `marked` 现在是 Electron renderer 的运行时依赖；`npm run build:electron` 会把 `node_modules/marked/lib/marked.umd.js` 复制到 `dist-electron/electron/renderer/vendor/marked.umd.js`。
- `TaskOutput` 阻塞等待后台任务输出时，已经按 Claude `TaskOutputTool` 生命周期把 `ToolContext.abortSignal` 传入 task wait；用户取消后不会继续挂住后台输出等待。
- `TaskStop` 的 remote stop 语义已经更接近 Claude：adapter-backed remote task 停止后进入 `killed`，无 stop 通道的 remote task 仍明确报不支持。
- LSP runtime 已补齐 Claude-style 文件预检、`workspaceSymbols` 空查询转发、provider unavailable 返回、无 runtime 时的工具暴露过滤、`documentSymbol` / `workspaceSymbol` 官方单数操作名入口，以及 malformed provider response 防御；更深 server lifecycle / plugin-backed provider discovery parity 仍可继续收口。
- ToolSearchTool 已按 Claude `ToolSearchTool` 源码搜索合同收口：支持 `select:` 多选、裸工具名、`mcp__server` 前缀、`+required` 必选词与 `max_results`；KainClaw 侧只保留当前可用工具与 MCP 动态工具聚合的适配层。
- Task 工具旧名兼容已按 Claude 源码收口：`KillShell`、`AgentOutputTool`、`BashOutputTool` 不再报 unknown tool，而是进入对应 canonical Task handler；`TaskOutput` 仍保持 Claude 官方 `task_id` 输入合同，不接受 `shell_id`。
- Electron 桌面壳已把这些斜杠命令接回真实的 `src/` host/runtime 路径：
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
- Electron 的 workspace 与 git inspection 语义已经拆开：
  - 选中的 workspace 仍然是用户选中的目录。
  - `/review` 和 `/verify` 会单独解析 git 上下文，只作为 inspection repo context 使用。
  - inspection repo 会在 provider/runtime/MCP tool 构建之前完成解析。
  - `workspace:set` 现在支持清空回 `unset`。
- Electron 面向用户的 review/verify 文案已经收口：
  - `Review task saved as ...`、`TaskOutput`、`task_id` 这类内部 follow-up 文本不再展示给终端用户。
  - workspace badge 直接显示目录名，不再显示 `需确认` 这类技术状态标签。
  - 非 Git 目录不再在 workspace 区域常驻显示 “not a git repo” 警告。

更新时间：2026-04-27

## 当前状态总览

- 主工作目录：
  - `E:\claudecodejingiang\vscode-extension`
- `vscode-extension/` 仍然是本地验证壳，不是最终产品形态。
- 当前能打包、能验证的是 Electron 内测壳，不是完整 Windows 正式客户端。
- 核心能力仍然必须优先落在 `src/` 的 runtime / service / adapter 层。
- Electron 只做桌面壳、权限、IPC、UI，不应继续承接新的核心业务逻辑。
- 项目主线仍然是与官方 Claude Code 能力持续对齐；图片、Office、Local Bridge、User Modeling、Auto Skill Generation 都属于扩展能力。
- 对 Claude 源码已有能力，必须先按源码逻辑复刻 baseline，再接 KainClaw 的 VS Code / Electron / storage / IPC 适配。
- MCP runtime 已补齐 transport、auth placeholder、resource no-support、tool result priority、normalized exposed tool names、remote browser OAuth、MCP prompt commands 和工具名归一化这些 Claude parity 基线；剩余缺口主要是 `oauth.xaa`、更深 token refresh/discovery edge cases，以及源码里未明确暴露为工具面的 templates 相关行为。
- Electron Markdown 与 `/verify` report 渲染已按 Claude-style `marked.lexer()` token 基线收口；verification 的 command/output 是结构化 raw text，不再依赖 fence 平衡。
- 当前 Tasks / toolRuntime parity 已补齐本批 shell task 基线，并补上 adapter-backed remote `TaskStop -> killed`；完整 hosted / detached remote background task parity 仍未闭环。
- 当前 Compact parity 已补齐可见 transcript 与模型侧 sidecar history 分离，但更深 token / transcript lifecycle 仍可继续收口。

## 当前验证边界

- 由 agent 默认执行：
  - `npm test`
  - `npm run check`
  - `npm run build`
- 涉及 Electron 壳、renderer、Markdown、IPC 或桌面可见行为时还必须执行：
  - `npm run build:electron`
  - `npm run check:electron`
- Electron 启动与手测由用户执行：
  - `npm run start:electron`

## 当前产品形态

### Electron 桌面壳

- Electron 当前主入口是聊天页，不再是旧的 `Image Lab` 独立首页。
- 当前桌面壳主要可见面包括：
  - 聊天页
  - 会话列表
  - 设置页
  - Prompt Library 抽屉
  - 找参考图抽屉
  - 图片编辑相关弹层
- Electron 现在应被准确描述为“真实可用的桌面验证壳”，不能对外表述成完整 Windows 客户端。

### Slash commands

- 当前桌面壳已接回这些已验证命令：
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
  - `/mcp auth <server>`
  - `/mcp call <tool_name> [json]`
- slash command 识别顺序已先于图片意图判断。
- `/compact` 不会再因为最近图片上下文而误走图片链路。
- `/review`、`/verify` 默认按用户语言输出。
- `/mcp` 的聊天输出现在也会按结构化状态卡渲染，`connected` 使用绿色 badge，避免继续靠普通文本猜状态。
- `/verify` 仍保留必要英文结构标签：
  - `### Check:`
  - `Command run:`
  - `Output observed:`
  - `Result: PASS/FAIL`
  - `VERDICT: PASS/FAIL/PARTIAL`

### Workspace / git inspection

- `workspace` 现在始终代表用户选中的目录。
- 普通聊天、MCP 工作区显示、Local Bridge 上下文都继续使用这个选中的目录。
- `/review`、`/verify` 会单独解析 inspection repo root：
  - 如果当前目录本身是 git 仓库，就直接使用它
  - 如果当前目录是父目录且能唯一识别出嵌套 repo，则只在 inspection 流程里使用那个 repo root
  - 如果无法识别唯一 repo，则在聊天消息里明确提示 degraded mode
- 普通非 Git 目录不会再在 workspace 区域常驻显示“当前目录不是 Git 仓库”。
- workspace badge 现在只显示目录名，不再显示 `需确认` 之类的技术态标签。

### 图片主链

- 图片生成和图片编辑当前都走聊天主链，而不是旧 `Image Lab` 参数页。
- 发送消息时会根据意图自动分流：
  - 普通聊天
  - 新图生成
  - 基于最近图片上下文的编辑
- 图片结果会回写聊天消息流，并保留桌面侧继续编辑/下载入口。
- 图片结果已支持本地持久化恢复。
- 图片批量生成会保留批次，不会覆盖原图。
- Prompt history 只记录明确的生成/编辑提交，不记录无关普通聊天输入。
- 意图分流逻辑已修复三处 bug（2026-04-25，Claude）：
  - 有附件 + 编辑意图时正确路由到 `image_edit`，不再误判为 `image_generate`。
  - 有图片上下文时，生成意图优先级高于问句，"生成一张海报，怎么样？"不再被误判为普通聊天。
  - 有图片上下文时，纯确认语（"好的"、"嗯"、"ok"）不再默认触发 `image_edit`。

## Prompt Library 当前状态

- Prompt Library 现在是聊天/编辑链路可打开的辅助抽屉，不是独立主页。
- 当前已稳定存在的能力：
  - 内置与用户条目共存
  - 新增 / 编辑 / 删除
  - 收藏 / 取消收藏
  - 收藏视图
  - 样本图
  - 一键使用
  - 设为参考图
  - 从图片反推双语提示词
- 数据层已落在：
  - `src/imageGeneration/promptLibraryRepository.ts`
  - `src/imageGeneration/promptLibraryBuiltins.ts`

## 找参考图当前状态

- 用户侧统一入口是“找参考图”，不再用旧的其它命名。
- 当前链路是显式两段式：
  - 先根据当前图像任务整理建议检索词
  - 再由用户确认或修改后主动开始搜索
- 当前搜索源仍是过渡方案：
  - `playwright -> 百度图片搜索页 -> 结果页抽取真实图地址与来源页`
- 长期目标仍然是：
  - 先做网页资料搜索
  - 再从资料页抽取视觉线索 / 可用图片

## 当前已经比较稳定的核心能力面

### 核心 AI/runtime

- Provider：
  - Anthropic
  - OpenAI
  - OpenAI-compatible
  - Claude CLI
- 已稳定存在的主能力：
  - 会话持久化 / 导出 / 恢复
  - MCP runtime（transport / resource / result / name normalization / remote OAuth / prompt command parity 已补齐；`oauth.xaa` 与更深 auth edge cases 仍未完成）
  - 文件工具 / 命令工具 / 浏览器工具
  - Tasks / background command
  - built-in Review / Verification
  - Thinking / Effort / Fast mode
  - Compact / Auto-compact
  - Auto-Memory
  - LSP phase 1 + 部分 phase 2（file preflight / workspaceSymbols query / provider availability parity 已补齐）
  - Worktree phase 1
  - Hooks 执行链
  - Custom Agents registry
  - Skills registry
  - User modeling

### 当前已接入的核心命令面

- 当前核心命令注册表中已存在：
  - `/commands`
  - `/agents`
  - `/skills`
  - `/hooks`
  - `/add-dir`
  - `/files`
  - `/plan`
  - `/compact`
  - `/mcp`
  - `/memory`
  - `/todo`
  - `/tools`
  - `/review`
  - `/verify`
- 桌面壳当前只应诚实暴露真实可用子集，不能把未接好的命令伪装成可用。

## Local Bridge / Office 当前状态

### Desktop runtime 边界

- `DesktopRuntimeServices` 注入层已经落地。
- 当前 Electron 真正接上的 runtime 只有：
  - `localBridgeRuntime`
- 当前仍停留在接口边界层的 runtime：
  - `desktopAutomationRuntime`
  - `browserBridgeRuntime`
  - `schedulerRuntime`

### Local Bridge

- `LocalBridgeRuntime` 已在 Electron 启动时真实拉起。
- 当前最小闭环已存在：
  - register
  - config
  - proxy
  - session context / message
- Local Bridge 当前会把状态发布回 Electron 聊天状态。

### Office / Word

- Word Add-in 已完成以下能力：
  - `office-addin/word/manifest.xml`（含 VersionOverrides 功能区按钮）
  - `documentReader.ts` / `documentSelection.ts`（读取）
  - `documentEditor.ts`（写回：replaceSelection、Track Changes）
  - `commentHandler.ts`（批注读取与 AI 处理）
  - taskpane 三标签页 UI：问答 / 编辑 / 批注
  - `package.json` / `webpack.config.js` / `tsconfig.json`（sideload 打包骨架）
- `src/officeBridge/` 已有完整桥接层：
  - `bridgeClient.ts`、`wordDocumentContext.ts`、`wordQuestionAnswer.ts`
  - `wordSelectionContext.ts`、`wordSelectedContextView.ts`
- 当前已可用能力（写回部分 2026-04-27，Claude）：
  - 文档问答（citation 可点击跳转）
  - 选区感知上下文
  - AI 写回选中文字（直接替换 / Track Changes）
  - 批注列表加载与 AI 一键处理
- 还未完成：
  - sideload 实际打包测试（需安装 Add-in 子依赖 `npm install` 后 `npm run build`）
  - Excel / PowerPoint Add-in（尚未开始）
  - 跨应用 session 上下文共享

## 当前明确未完成

- Browser Bridge 本体
- Desktop automation / Computer Use 本体
- Scheduler / Cron 本体
- 完整 desktop Skills / Agents / Hooks UI
- 完整 Office 业务链
- 完整 Windows 正式客户端形态
- Voice mode
- Prompt suggestion
- Plugin / Skills 市场

## 已知非阻塞尾项

- 删除最后一个 provider 时，聊天区仍可能提示“未找到 Provider 配置”。
- `supabase` MCP 当前仍可能出现 `Connection closed`。

## 当前关键风险

- `src/extension.ts` 仍是高风险宿主入口，虽然已经抽出大量 host/helper，但总控逻辑依旧偏厚。
- `electron/renderer/index.html` 当前仍是单文件验证壳，不应继续堆新的核心产品逻辑。
- `electron/ElectronChatPanel.ts` 仍是桌面壳总控，不应继续承载新的 runtime 级业务逻辑。
- 当前“找参考图”虽然已切到更符合中国大陆用户环境的搜索链，但仍是过渡态，不是最终资料搜索编排层。
- `DesktopRuntimeServices` 里真正接上的 runtime 仍然太少，桌面真闭环还没建完。

## 下一优先级

1. 继续把 `extension.ts` 的宿主总控往 host / runtime / adapter 下沉
2. 继续收桌面壳真实可用子集，不虚报未接好的能力
3. 继续收 `/review`、`/verify`、task/tool 链路的 parity 边界
4. 继续维持三份主文档写成“当前状态”，不回到流水账

## 相关规格与参考路径

### 主规格与参考

- 主产品规格：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\v1-product-spec.md`
- 官方源码能力索引：
  - `E:\claudecodejingiang\vscode-extension\.kiro\source-reference.md`
- 当前实现对账：
  - `E:\claudecodejingiang\vscode-extension\.kiro\official-gap-analysis.md`
- 当前实现记忆：
  - `E:\claudecodejingiang\vscode-extension\.kiro\implementation-memory.md`

### 未来能力规格入口

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
