# 实现记忆

## 当前覆盖说明 / Current Override - 2026-04-28

- 2026-04-28 installed-skills implementation memory:
  - Primary installed-skill roots are now `~/.kainclaw/skills` and `.kainclaw/skills`, with Claude roots kept as compatibility-only readers.
  - The installer MVP now lives on the `/skills` command surface: `/skills list`, `/skills install <source>`, and `/skills remove <skill-id>` write only to the primary KainClaw roots, while `~/.claude/skills` remains read-only compatibility input.
  - The installed-skills execution path now covers argument substitution, `allowed-tools`, model/effort overrides, `context=fork`, and explicit shell metadata handling.
  - Installed-skill hooks now execute in KainClaw for prompt / command / http / agent definitions, support matcher filtering for tool events, and persist as session-scoped hooks for the active conversation.
  - Electron prompt handling now reuses the same conversation-scoped installed-skill hook store, so follow-up desktop prompts inherit hooks registered by earlier slash-skill invocations.
  - Electron prompt handling now also carries installed-skill slash rewrites all the way into the live prompt execution lane. Do not accept a state where `/commands` can discover an installed skill but typing `/<skill>` still falls through to plain chat.
  - Installed-skill command rewrites now collapse into a single `installedSkillExecution` plan object that carries prompt text, tool filters, model/effort overrides, fork context, and per-invocation hooks through prompt preparation and execution.
  - KainClaw now exposes a model-visible installed-skill registry through the workspace system prompt and a `SkillTool` entrypoint for installed skills whose runtime semantics can already be represented safely. The tool loads the expanded installed-skill prompt and enforces a model-side gate for `disable-model-invocation` plus the remaining advanced metadata that the current runtime cannot honor safely.
  - The model-side `SkillTool` path now also applies installed-skill `allowed-tools` by shrinking the provider-visible tool payload for the rest of the current agent run after a skill is loaded.
  - KainClaw now also supports safe model-side `context=fork` installed skills by recursively running a separate agent turn with the forked skill prompt and returning its final text as the parent tool result. This keeps the fork isolated from the parent conversation state while avoiding a wider host/runtime refactor.
  - Model-visible installed skills can now also register hooks through the same conversation-scoped installed-skill hook store used by slash execution. Those hooks are applied immediately to later tool calls in the same model run and continue to persist for later prompts in the same conversation.
  - Model-visible installed skills can now also apply per-skill `model` / `effort` overrides by rebuilding the active provider/runtime state for the rest of the current run, or by applying the override only inside the fork when the skill runs with `context=fork`.
  - Model-visible installed skills now also honor agent-hook-specific `agentModel` overrides by rebuilding the provider only for the hook sub-run, matching the existing prompt-side installed-skill hook behavior closely without introducing a second hook runtime.
  - Installed command hooks now preserve `skillRoot`, accept official matcher aliases (`Bash`, `Edit`, `Write`) against KainClaw tools, pass the official stdin/environment payload (`tool_input`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_SKILL_DIR`) to hook scripts, and honor `permissionDecision: ask|deny` instead of relying only on exit codes.
  - Electron now has a minimal `AskUserQuestion` compatibility modal. It supports multiple-choice questions, multi-select, an Other/custom free-text answer path, and optional note annotations, and is good enough to let official interactive skills keep their control flow inside the desktop shell instead of spilling back into plain chat.
  - Electron now carries a targeted official-skill compatibility lane for `freeze` / `unfreeze`: the desktop shell asks for the directory path in-chat, writes the active boundary to `CLAUDE_PLUGIN_DATA` / `~/.gstack/freeze-dir.txt`, and clears that state on `/unfreeze`.
  - That `freeze` compatibility lane should now prefer the `AskUserQuestion` modal rather than a free-form assistant message. If a future edit reintroduces plain chat prompts for interactive skills while the modal exists, treat that as a regression.
  - Do not reintroduce duplicate approval helper definitions in `electron/renderer/index.html`. The AskUserQuestion-compatible approval path is now the only active implementation and should stay that way unless the renderer is split properly.
  - `Tool Use` transcript rows should present the tool name as a badge/chip rather than plain inline code. Keep the tool label visually distinct from result badges: tool identity is neutral metadata, not success/failure state.
  - Electron AskUserQuestion should keep renderer-local draft state per question. Do not regress to a flat one-shot form for multi-question flows now that the desktop shell supports question chips, intermediate next/review transitions, and a final review/submit step.
  - When the user navigates inside Electron AskUserQuestion, preserve custom Other answers, optional notes, and selected preview metadata in the final response payload. Those annotations are part of the tool contract now, not disposable UI-only state.
  - Keep `/debug ask-user-question [single|multi]` available in the Electron shell as a deterministic parity trigger. It exists specifically so QA can exercise the real AskUserQuestion callback path without waiting for an unrelated feature to emit the right tool request.
  - Electron-owned dialog copy now depends on a persisted UI language setting (`zh-CN` / `en-US`). Keep the language preference in the `kainclaw.*` namespace for new settings, and do not introduce new `cain.*` keys for freshly added desktop-shell preferences.
  - Dangerous commands that have already been confirmed through an installed-skill hook now receive a one-shot pass-through for the current `run_command` invocation. Without that override, `/careful` can warn correctly but the host allowlist will still hard-block the confirmed command and break Claude parity.
  - The right success bar for official-skill parity is now: discovery, slash execution, hook persistence, compat state file semantics, and the real Electron runtime behavior of representative official skills (`freeze`, `careful`). Do not mark parity closed just because the registry or model-side `SkillTool` exists.
  - Current automated baseline after this slice: `154` test files, `1147` tests passed.

- 硬规则（用户明确设定）：
  - 只要功能已经在本地 Claude 源码存在，实施和调试都必须先沿着 Claude 的源码链路做端到端复刻，再做 KainClaw 宿主适配。
  - 不允许先猜测、先规避、先做平行实现，再回头“修成像 Claude”。
  - 只有 Claude 源码没有覆盖的能力，才允许按 KainClaw 自己的标准独立设计。
- Electron shell 命令接线规则：
  - 如果某个能力已经在 `src/` 里有成熟的 host/runtime 路径，优先把桌面壳接回那条路径，不要发明 desktop-only 的平行重写。
- 本轮确认的具体例子：
  - `/todo` 可以通过给 Electron shell 的 `ToolContext` 接入真实 task runtime 来恢复。
  - `/compact` 可以复用 `handleCompactCommandWithHost(...)` 恢复。
  - `/review` 和 `/verify` 可以复用 `handleReviewCommandWithHost(...)` 与 `handleVerificationCommandWithHost(...)` 恢复。
- Electron shell 会话卫生规则：
  - 面向用户的斜杠命令回复仍然要展示，并持久化进当前 session。
  - 但不应该进入后续模型上下文的回复，必须打标并从后续 provider history 里过滤掉。
  - `Review task saved as ...` / `TaskOutput` 这类 background inspection retrieval 的内部 follow-up 字符串，除非进入 operator/debug 界面，否则不要展示给桌面壳终端用户。
- 本轮验证过：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
  - `npm run check:electron`
- 当前验证基线：
  - `152` 个测试文件
  - `1121` 个测试通过
- hosted review / RemoteAgentTask 适配规则：
  - `/ultrareview` 这类 Claude 已覆盖的能力，生命周期和用户语义要先对齐 Claude 源码。
  - 如果本地没有 Claude 的云端 CCR / RemoteAgentTask backend，允许只对传输层做薄适配；当前适配方式是 detached `Claude CLI` review worker，而不是另起一套 KainClaw review 语义。
  - hosted review 完成后，应通过 notification-first 路径把完整 findings 回流给用户，而不是只给 `Result:` 截断预览。
- hosted verification / RemoteAgentTask 适配规则：
  - `/ultraverify` 这类 Claude 已覆盖的能力，也要先对齐 Claude hosted verification / `RemoteAgentTask` 生命周期；当前本地适配方式是 detached `Claude CLI` verification worker。
  - 启动阶段要先回显 task id / output path，同时聊天保持 waiting / background 状态；完成后自动回流完整 verification report + `VERDICT`，不要一启动就让 UI 回到 idle。
  - 用户 stop 后要进入 stopped / cancelled 路径，不能把中断任务伪装成自然完成。
- 本批 Claude parity 已同步收口项：
  - 文档/规则：Claude 源码优先、handoff、gap analysis、source-reference、UTF-8 without BOM。
  - Renderer：Electron Markdown 与 `/verify` report 渲染以 Claude `marked.lexer()` token 模型为 baseline。
  - Verification：concrete target gate、问候/空范围 `PARTIAL`、工作区证据兜底、语言跟随、diff/provenance/report fence 处理。
  - Tasks/toolRuntime：`local_bash` shell task 语义、Claude-style id、Task 工具合同、非交互 UTF-8 PowerShell 输出、`TaskOutput` abort wait。
  - Compact/session lifecycle：可见 transcript 与模型侧 compact history 分离，runtime state 持久化 workspace root 与 compact metadata。
  - TaskStop remote 语义：adapter-backed `remote_agent` 停止后记录 Claude-style `killed`；没有 stop 通道的 remote task 仍拒绝，不伪造停止成功。
  - LSP：file-backed 操作按 Claude `LSPTool.validateInput` 做缺失文件、非普通文件、超过 10MB 的预检，UNC 路径跳过本地 probe；`workspaceSymbols` 允许省略/空查询并转发 `query: ""`。
  - LSP provider availability：provider 返回 `undefined` 时按 no-provider 状态返回；没有 LSP runtime 时不暴露 `LSP` 工具。
  - LSP operation naming：工具入口接受 Claude 官方单数名 `documentSymbol` / `workspaceSymbol`，适配层归一化到内部 `documentSymbols` / `workspaceSymbols`，避免把官方命名误判为 unsupported operation。
  - LSP provider response hardening：provider 返回 malformed location / symbol / call hierarchy 数据时，先过滤缺失 URI/range/location 的结果，或在 call hierarchy 中降级显示 `<unknown location>`，避免一个坏响应打断整个 LSP 工具。
  - ToolSearchTool：搜索合同按 Claude `ToolSearchTool` 源码收口，支持 `select:ToolA,ToolB`、裸工具名精确选择、`mcp__server` 前缀、`+required optional` 必选词搜索，以及 `max_results` 输入别名。
  - Task tool aliases：`KillShell` 归一到 `TaskStop`，`AgentOutputTool` / `BashOutputTool` 归一到 `TaskOutput`；ToolSearch 对这些 deprecated Claude aliases 返回 canonical 工具名。
  - MCP runtime：按 Claude MCP 源码补齐 `type: "http"` / `type: "sse"` transport 语义、`needs-auth` + `mcp__<server>__authenticate` placeholder、无 resources server 的明确错误、MCP result priority、`isError` 工具错误处理，以及 `normalizeNameForMCP` 对外工具名安全化。
  - MCP runtime：远端 `http` / `sse` OAuth 现在也按 Claude `OAuthClientProvider + localhost callback + PKCE` 主链接通；prompt surface 按 Claude `fetchCommandsForClient()` 语义落为 `mcp__<server>__<prompt>` commands；执行层兼容模型产出的单下划线 / 连字符转下划线变体；Electron transcript 已补回 Claude-style `tool_use / tool_result` 可见性。
  - provider runtime identity：身份层固定为 KainClaw，多功能助手文案放在 system prompt；当前 provider / model 信息改由宿主注入 runtime identity note，不让模型自由脑补自己是 Claude / GPT / DeepSeek。
  - tool assembly parity：按 Claude `src/cli/print.ts` 的 `uniqBy(name)` 逻辑，对 MCP tool 列表、workspace tool 聚合、Electron shell tool 池，以及发给 provider 的 `tools` payload 做最终按名去重，避免第三方 `Anthropic` / `DeepSeek` 上游直接报 `Tool names must be unique.`。
- MCP 本轮定向验证：
  - `npm test -- --run src/mcpRuntime.test.ts src/mcpRuntime.helpers.test.ts`（25 tests passed）
  - `npm test -- --run src/toolRuntime.test.ts`（90 tests passed）
  - `npm run check`
  - `npm run build`
  - `git diff --check -- src/mcpRuntime.ts src/mcpRuntime.test.ts src/mcpRuntime.helpers.test.ts`
  - `npm test`
  - `npm run build:electron`
- Electron 路由规则：
  - 必须先识别斜杠命令，再做普通聊天 / 图片意图推断。
  - 否则最近生成图上下文会错误劫持 `/compact` 这类命令，把它们误路由到图片编辑流程。
- Electron workspace 解析规则：
  - 选中的 workspace 是用户选中的文件夹，不是 git repo root。
  - Git repo detection 是单独的 inspection-only 事项；不能因为发现嵌套 repo 就全局改写 workspace。
  - 如果选中的是协作父目录，并且里面只有一个嵌套 repo，`/review` 和 `/verify` 可以为了 git diff 解析那个 repo；但普通 chat/runtime 流程仍应留在用户选中的 workspace。
  - 如果 Electron 无法识别唯一 repo，`/review` 和 `/verify` 必须提示本地 git diff 上下文降级，不能假装 inspection 仍有可信 repo root。
  - 对 `/review` 和 `/verify`，inspection repo resolution 必须在 provider resolution、MCP tool loading、runtime construction 和 command dispatch 之前完成；不能拖到最终 handler 边界才切 root。
  - Electron IPC 的 workspace 更新必须支持清空回 `unset`；空字符串更新是合法状态转换，不是 no-op。
- Electron workspace UI 规则：
  - 正常 workspace 解析要保持安静；自动下降到真实 repo 时，通常只更新 effective workspace，不打开大块诊断面板。
  - 只有异常状态才展开 workspace UI，例如非 Git 降级、路径缺失、多个候选 repo。
  - 多个嵌套 repo 候选同时存在时，要在 shell 里暴露可点击候选项，不要让用户手动反复猜路径。
  - workspace badge 应直接显示目录名；默认用户界面不要加 `需确认` 这类技术状态前缀。
- Electron runtime 一致性规则：
  - Electron chat/runtime、MCP workspace 展示、Local Bridge runtime context 都应使用用户选中的 workspace path。
  - 只有 git-sensitive inspection flows 才切到单独解析出的 repo context。
- 内置 inspection 语言规则：
  - `/review` 和 `/verify` 默认应跟随用户语言。
  - 如果用户使用中文，说明主体用简体中文。
  - `/verify` 仍保留必须的英文结构标签和字面量 `VERDICT:` 行。
- 强源码对齐规则：
  - 如果本地 Claude Code 源码包含目标功能、行为、工作流、prompt contract、renderer 行为、tool/runtime 路径或 session 生命周期，必须先检查并复刻源码逻辑。
  - 不要用 prompt-only 约束、regex 猜测或平行自研实现替代 Claude 已覆盖的行为。
  - KainClaw-specific 标准只用于 Claude 没有等价行为的区域，或用于 Claude-compatible baseline 之后的 VS Code / Electron / storage / IPC 薄适配。
- Electron Markdown renderer 规则：
  - Markdown 行为的 Claude 源码参考是 `E:\claudecodejingiang\src\components\Markdown.tsx` 和 `E:\claudecodejingiang\src\utils\markdown.ts`。
  - Electron renderer 应以 Claude 的 `marked.lexer()` 块级 token 模型为 baseline，不应再使用 regex/line-parser Markdown 实现作为主路径。
  - 除非已经明确审查 raw HTML passthrough / XSS 风险，否则不要在 sandbox renderer 里调用 `marked.parse()`；当前实现是 token-render，并转义 raw HTML。
  - `marked` 是 renderer 的运行时依赖，`build:electron` 必须把 `node_modules/marked/lib/marked.umd.js` 复制到 `dist-electron/electron/renderer/vendor/marked.umd.js`。
- `/verify` 报告渲染规则：
  - Verification reports 是结构化报告，不是普通 Markdown。
  - 通过 `### Check:`、`Command run:`、`Output observed:`、`Result:`、`VERDICT:` 这些必需标签识别。
  - `Command run` 和 `Output observed` 要按原始捕获文本处理，并渲染为转义后的 `<pre><code>` 块。
  - 不能依赖命令 / 输出里的 Markdown 代码围栏是否平衡；README 输出和嵌套代码围栏都必须按字面量保留。

更新时间：2026-04-27

## 使用规则

- 本文件只记录长期有效的实现结论、架构边界、风险区和踩坑经验，不记录每个小切片的流水账。
- 只保留以后还会重复使用的判断和模式。
- 图片、Office、Local Bridge 这类扩展能力可以写，但不能覆盖项目主核心。
- 统一以 UTF-8 without BOM 保存。

## 当前稳定结论

### 1. 产品定位

- `vscode-extension/` 是本地验证壳。
- 最终交付目标是 Windows 桌面程序。
- 当前 Electron 是桌面验证壳，不是完整正式客户端。
- 新能力应优先沉淀到 `src/` runtime / service / adapter。
- 项目主核心仍然是“与官方 Claude Code 能力持续对齐”。
- 图片、Office、Local Bridge、User Modeling、Auto Skill Generation 都是扩展能力，不应在文档里反客为主。

### 2. 文档分工

- `official-gap-analysis.md`
  - 只维护能力矩阵、状态、证据、缺口和阶段优先级。
- `CLAUDE_HANDOFF.md`
  - 只维护当前真实状态、验证基线、关键风险、下一优先级。
- `implementation-memory.md`
  - 只维护长期有效的实现结论、边界、模式和踩坑经验。

### 3. 验证基线登记

- 当前登记基线：`152` 个测试文件，`1121` 个测试通过。
- 当前登记通过命令：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
  - `npm run check:electron`
- 当前高风险宿主入口仍然是 `src/extension.ts`。

### 4. 当前核心能力分层

#### 4.1 官方对齐主线

- Provider 主链
- 会话持久化 / 导出 / 恢复
- MCP runtime
- 文件工具 / 命令工具 / 浏览器工具
- Tasks / background command
- built-in Review / Verification
- Thinking / Effort / Fast mode
- Compact / Auto-compact
- Auto-Memory
- LSP phase 1 + 部分 phase 2
- Worktree phase 1
- Hooks 执行链
- Custom Agents registry
- Skills registry

#### 4.2 KainClaw 扩展能力

- Auto skill generation
- User modeling
- 图像生成 / Prompt Library / 参考图搜索
- Local Bridge / Word Add-in

#### 4.3 文档书写约束

- 任何一轮文档整理，都不能把“图片链路”写成项目主核心。
- `implementation-memory.md` 里必须优先保留 Claude 主核心能力和宿主减债经验。
- 扩展能力可以写，但只能放在主核心之后。

## 需要长期遵守的架构前提

### 1. Electron 只做壳

- Electron 主进程、`electron/ElectronChatPanel.ts`、`electron/renderer/index.html` 都只是桌面壳。
- 核心业务能力必须优先落到 `src/`。
- 当前 `DesktopRuntimeServices` 已定义聚合边界，但真正接上的只有 `localBridgeRuntime`。
- `desktopAutomationRuntime`、`browserBridgeRuntime`、`schedulerRuntime` 当前都还只是接口层，不是已接好的能力。

### 2. 新 desktop 能力先立 runtime 边界

- 需要桌面能力时，优先在 `src/platform/` 或等价 runtime 层定义边界。
- 当前已经明确的边界有：
  - `IDesktopAutomationRuntime`
  - `IBrowserBridgeRuntime`
  - `ISchedulerRuntime`
  - `ILocalBridgeRuntime`
- 不要直接把新能力状态机塞回 `electron/ElectronChatPanel.ts` 或 `electron/renderer/index.html`。

### 3. 图像主链已经迁到聊天流

- 当前图像主入口是聊天流，不是旧 `Image Lab` 页面。
- 旧 `Image Lab` 仍可视作：
  - image runtime 的过渡承载面
  - 部分结果 / 参数壳
  - 历史 UI 遗留
- 后续文档和实现描述里，不要再把旧 `Image Lab` 写成产品主入口。
- 意图分流 `chatPromptIntent.ts` 的已知正确优先级（2026-04-25，Claude 修复）：
  - `hasRecentGeneratedImageContext=true` 时：生成意图 > 问句 > 确认语 > 默认 `image_edit`。
  - `hasRecentGeneratedImageContext=false` 时：有附件 + 编辑意图 → `image_edit`；有附件或生成意图 → `image_generate`；其余 → `chat`。
  - 纯确认语（"好的"、"ok"、"嗯"）绝不能触发 `image_edit`，已通过 `ACKNOWLEDGMENT_PATTERNS` 拦截。

### 4. Prompt Library 是辅助抽屉，不是独立主页面

- Prompt Library 的正确形态是聊天/编辑链可打开的右侧抽屉。
- 它不是单独主页面。
- 它不是设置页的一部分。
- 它也不是图像模型配置页的一部分。

### 5. 找参考图是显式增强链，不是默认编辑链

- 普通“加花、换背景、加元素”这类需求，默认应直接走图片编辑链。
- `找参考图` 只在用户主动点击入口时，进入显式素材搜索链。
- 用户侧心智应是“给当前图片任务补参考图”，不是“通用资料搜索”。

## 当前稳定的工程经验

### 1. 核心 AI/runtime 能力不能从记忆里删掉

- 这个项目最重要的长期记忆，不是某一轮图片交互，而是 Claude 主核心能力已经稳定存在：
  - Provider 主链
  - 会话持久化
  - MCP runtime
  - 文件 / 命令 / 浏览器工具
  - Tasks / background command
  - Review / Verification
  - Thinking / Effort / Fast mode
  - Compact / Auto-Memory
  - LSP
  - Worktree
  - Hooks
  - Custom Agents / Skills registry
- 这些能力在文档里必须始终可见，否则后续 agent 很容易误判项目重点。

### 2. 官方对齐优先，KainClaw 扩展第二

- 做产品和文档判断时，默认顺序是：
  - 先判断这是不是官方 Claude Code 主核心能力。
  - 再判断这是不是 KainClaw 的扩展能力。
- 如果官方 Claude Code 源码已经实现了该行为，源码逻辑就是验收基线；先复刻源码，再接 KainClaw 的 VS Code / Electron / storage / IPC 适配。
- 不能用提示词约束、测试补丁或本地 regex 猜测替代官方源码里已经存在的行为。
- 如果两者混在一起写，必须显式标出“主核心”和“扩展”。
- 图片、Office、Local Bridge 这些扩展能力可以很重要，但不应覆盖主核心叙事。

### 3. 这个项目并不只是“聊天 UI”

- 当前项目不是一个只剩 Electron 聊天页的产品。
- 真正主核心是：
  - agent / runtime / tool / task / review / verification / compact / memory / lsp / worktree 这一整条 Claude 能力栈。
- Electron、聊天页、图片页都只是当前验证界面。

## Phase 2 收尾的主线经验

### 0. `MCP runtime` Phase 2

- MCP 配置解析要以 Claude MCP 源码为 baseline：`type: "http"` 表示 Streamable HTTP，`type: "sse"` 表示 SSE；SSE server 不能被误路由到 Streamable HTTP。
- 未知远端 transport（例如 `ws`）应被忽略，不要猜测成某个已知 transport。
- 远端认证失败应进入 `needs-auth` 状态，并暴露 Claude-style `mcp__<server>__authenticate` placeholder；但本地 OAuth browser flow 尚未接线时，placeholder 只能返回清晰的 KainClaw 配置指引，不能伪装成已完成 OAuth。
- `ReadMcpResourceTool` 对已连接但不支持 resources 的 server 要返回明确“不支持 resources”的错误，不应把该 server 标记为 failed，也不应关闭连接。
- MCP tool result 的优先级要按 Claude 语义处理：`isError: true` 是工具错误；成功结果优先格式化 `toolResult`，再处理 `structuredContent` 和 `content[]`。
- MCP tool-level error 不能污染 server connection 状态；只有连接层失败才应影响 server 健康状态。
- 对外暴露的 MCP tool/server 名要走 Claude-compatible `normalizeNameForMCP` 安全化；内部调用仍使用原始配置里的 server/tool 名。resource read 接收 normalized server name 时，要能映射回原始 server 名。
- 远端 `http` / `sse` MCP OAuth 要按 Claude `OAuthClientProvider` 主链接入宿主能力：浏览器打开、localhost callback、token/client/discovery state 持久化、认证成功后的 tool cache 失效。不要再用“配置 token / headers”提示词假装 OAuth 已完成。
- Claude 源码里的 MCP prompts 不是另一套本地工具，而是动态 commands。KainClaw 也应优先按 `mcp__<server>__<prompt>` command surface 复刻，而不是平行发明 prompt tool。
- 调 Claude 覆盖的 MCP/工具问题时，首先要把真实 `tool_use / tool_result` 可见性补出来，再分析工具为什么返回空。不要只看 assistant 事后总结去猜结果语义。
- 仍未完成的 MCP parity：`oauth.xaa`、更深 refresh/discovery/step-up edge cases，以及 Claude 源码里没有明确暴露成工具面的 templates 行为。

### 1. `tasks / toolRuntime` Phase 2

- detached local background command 需要把状态、输出文件刷新、duplicate-run reuse、停止回收这几条链都做完整。
- background shell command 应登记为 `local_bash`，并保留 Claude-style `shell_id` / `task_id` 语义；不要再和 `local_agent` 混在一起。
- shell command 输出要走非交互 UTF-8 PowerShell，并清理 ANSI 噪声，避免验证报告和 task output 被编码或控制符污染。
- `TaskStop` 不能在 stop 通道不存在时伪造“已取消”。
- `TaskStop` 对 adapter-backed remote task 要记录 Claude-style `killed` 终态；无 stop pathway 的 remote task 仍必须拒绝。
- built-in inspection 任务要保留 `command_text / prompt / plan_file_path / diff_ref` provenance。
- `TaskGet`、`TaskOutput` 对缺失任务必须返回结构化 `not_found`，不能返回含糊状态。
- `TaskOutput` 的阻塞等待必须传递当前 `abortSignal`，这和 Claude `TaskOutputTool` 的 wait lifecycle 一致；用户取消后不能继续挂住后台任务输出等待。
- adapter-backed remote stop 已有 `killed` 语义；完整 hosted / detached remote background task parity 仍然是未完成项，不能在文档里写成已闭环。

### 2. Verification / Review Phase 2

- Verification 只有 `PASS` 才能算成功收口。
- `FAIL`、`PARTIAL` 必须保留为真实终态，而不是被吞掉。
- `/verify` 必须先确认存在具体可检查实现目标；问候/泛聊天/空范围应直接 `VERDICT: PARTIAL`。
- 只有在工作区存在真实项目证据时，缺少会话原始任务才可以回退到“验证当前工作区项目状态”。
- 中文用户的说明主体应跟随中文，但 `/verify` 的结构化标签仍保留英文 literal。
- diff-aware review / verification 是关键收口点：
  - 本地 git range
  - 公开 GitHub PR / compare URL
  - `diffRef` 追溯
  - plan file path 透传
- pending-plan lifecycle 要有 started-crash reset 等完整语义。
- remote / background verification parity 仍未完成。

### 3. Compact Phase 2

- compact 后不能改写或丢失用户可见 transcript；模型侧 compacted history 应放进 runtime sidecar state。
- session runtime state 要能持久化 `workspaceRoot`、`modelConversation` 和 compact metadata，VS Code 与 Electron host 都要能恢复。
- compact 不能丢 attachment-only user message。
- compact token 估算必须把 image attachment 算进去，否则阈值会严重失真。
- assistant tool-call message 也要保留和计数。
- repeated `<analysis>...</analysis>` block 必须做彻底清理，不能只清第一段。
- auto-compact no-op 场景也要正确收尾，不能只处理真实 compact 分支。

### 4. LSP / Worktree Phase 2

- file-backed LSP 操作要在 runtime 入口前按 Claude `LSPTool.validateInput` 做文件预检：缺失文件、非普通文件、超过 10MB 直接失败；UNC 路径跳过本地 `stat` probe，避免网络路径预检阻塞。
- `workspaceSymbols` 的 `query` 可以省略或为空字符串，传给 provider 的值应是 `""`，不能被本地 schema 误拦截。
- LSP provider 返回 `undefined` 要表示 provider/server 不可用，不能混同为“有 provider 但空结果”；无 LSP runtime 的 workspace 不应把 `LSP` 工具暴露给模型或 ToolSearch。
- ToolSearchTool 的搜索语法必须以 Claude `ToolSearchTool.ts` 为 baseline：`select:` 直接选工具、裸工具名精确选中、`mcp__server` 前缀匹配 MCP 工具、`+required` 作为必选词、`max_results` 作为官方输入别名。KainClaw 只做当前可用工具和 MCP 动态工具聚合适配。
- Task 工具的 deprecated aliases 也属于 Claude 源码合同：`KillShell` 必须路由到 `TaskStop`，`AgentOutputTool` / `BashOutputTool` 必须路由到 `TaskOutput`。但 `TaskOutput` 的输入仍按官方合同只接受 `task_id`，不要因为 `KillShell` 兼容而给 `TaskOutput` 增加 `shell_id`。
- Claude 源码在最终 tool pool assembly 上还会按 `name` 去重（参考 `src/cli/print.ts` 的 `uniqBy(..., "name")`）。KainClaw 的 MCP 列表、workspace tool 聚合、Electron shell tool 池，以及发给 provider 的 `tools` payload 也必须做同样的去重，避免第三方 `Anthropic` / `DeepSeek` 这类严格上游直接报 `Tool names must be unique.`。
- gitignored 过滤要前置到 definition / implementation / references / workspaceSymbols / call hierarchy 这些入口。
- `maxResults` 必须在更外层先收口，避免深层结果再裁切。
- Worktree 要做：
  - worker-only gate
  - no-op exit summary
  - persisted session invalid-name cleanup
  - persisted session whitespace normalization
  - collision-resistant state filename
  - 从 canonical worktreeName 重建 persisted branch

### 5. `extension.ts / handlePrompt()` 宿主减债

- `handlePrompt()` 不应继续堆大而全逻辑，要持续往 host / factory / runtime 下沉。
- 一旦某条逻辑已经有可复用的 host / helper / runtime，就不要再把薄包装重新塞回 `extension.ts`。
- 当前已经验证过的一组稳定模式是：把固定依赖收进 host factory，再把 `extension.ts` 里会变化的会话状态、宿主字段和 webview 回调作为第二段注入。
- 最近已经按这个模式继续收口的装配包括：
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
- 这些收口都属于 KainClaw 自己的 VS Code / Electron 宿主 wiring 减债，不属于重写 Claude 覆盖区逻辑；Claude 已覆盖的 runtime / prompt / tool / session 语义仍然保持源码优先、行为不漂移。
- 当前已经形成可复用的宿主减债路径，代表文件包括：
  - `legacyEnvFallback.ts`
  - `providerHost.ts`
  - `providerRuntimeOptionsHost.ts`
  - `providerValidation.ts`
  - `sessionUi.ts`
  - `hostUi.ts`
  - `hostRuntimeHelpers.ts`
  - `activityTracker.ts`
  - `approvalHost.ts`
  - `editorInteractionHost.ts`
  - `webviewStateHost.ts`
  - `backgroundTaskHost.ts`
  - `inspectionTaskHost.ts`
  - `inspectionSessionHost.ts`
  - `inspectionHost.ts`
  - `inspectionPromptHost.ts`
  - `inspectionCommandHost.ts`
  - `conversationRuntimeStateHost.ts`
  - `conversationHistoryHost.ts`
  - `companionHost.ts`
  - `conversationScopeHost.ts`
  - `workspaceStatusHost.ts`
  - `compactHost.ts`
  - `toolLaunchHost.ts`
  - `promptSetupHost.ts`
  - `promptLifecycleHost.ts`
  - `promptSwarmHost.ts`
  - `workspaceRuntimeShell.ts`
  - `workspaceRuntimeHost.ts`
  - `workspaceHost.ts`
  - `promptSessionHost.ts`
  - `promptCommandHost.ts`
  - `promptExecutionHost.ts`
  - `promptTurnHost.ts`
  - `promptFlowHost.ts`
  - `promptHostFactory.ts`
  - `promptRequestFactory.ts`
  - `promptRequestExtensionHost.ts`
  - `promptCallbackHost.ts`
  - `assistantReplyHost.ts`
  - `readySequenceHost.ts`
  - `settingsHost.ts`
  - `settingsPanelHost.ts`
  - `sessionListHost.ts`
  - `sessionPanelHost.ts`
  - `sessionLifecycleHost.ts`
  - `savedSessionHost.ts`
  - `sessionMutationHost.ts`

## 已从会话恢复出的推进模式

### 1. 2026-04-15 不是单线推进，而是拆 lane 并行

- lane A 主攻 `extension.ts` / payload / prompt 主链减债。
- lane B 主攻 `tasks / toolRuntime` 边界与收口。
- inspect lanes 负责：
  - 只读核查
  - 最小清理建议
  - test/build coverage 核对

### 2. 2026-04-20 是 bounded parity hardening

- `Fix compact robustness`
- `Fix compact parity gap`
- `Harden compact parity`
- `Fix LSP worktree robustness`
- `Harden LSP worktree parity`
- `Harden lsp/worktree parity`

这组历史说明：

- `compact`
- `lsp`
- `worktree`

都不是一次性做完的，而是多轮有边界收口推进。

### 3. 2026-04-22 到 2026-04-23 是扩展能力往聊天主链迁移

- `Local Bridge` 接线推进
- `gpt-image-2` 接入讨论与验证
- 图像模型列表完善
- `Improve Image Lab UX`

这组历史说明：

- 扩展能力的正确方向不是继续堆旧页，而是接到统一聊天式工作流里。

## 图像链路的长期结论

### 1. 图片结果必须先本地化再持久化

- 远端 provider 返回的图片 URL 不能直接作为聊天消息和结果画廊的长期数据源。
- 正确做法是：
  - 主进程先拉回图片
  - 转成 data URL
  - 再进入聊天消息和本地持久化
- 否则会出现“任务显示成功、图片却不显示、后续编辑 / 参考图又 fetch failed”的假成功状态。

### 2. 批量数量和执行 prompt 必须分离

- “生成三张图”是输出数量，不是单张图的视觉描述。
- 应先解析 `batchCount`，再让执行 prompt 聚焦“单张图长什么样”。
- 对多张独立图请求，要有 anti-collage guard，避免模型把多张图拼成一张。

### 3. 尺寸 / 比例解析应先于图像请求

- prompt 中显式写出的：
  - `16:9`
  - `9:16`
  - `1920x1080`
- 都应优先覆盖默认尺寸。

### 4. Prompt Library 卡片不要把原文直接塞进 `onclick`

- 只要提示词里有 JSON、引号或长文本，内联属性就容易坏。
- 稳定做法是：
  - 先按稳定 id 绑定
  - 点击后再在 JS 里查条目

### 5. Prompt Library 当前稳定边界

- Repository 在 `src/imageGeneration/promptLibraryRepository.ts`
- 内置条目在 `src/imageGeneration/promptLibraryBuiltins.ts`
- 内置提示词不应强制只读成“不可治理资产”，应支持 override / hide
- 收藏页必须是用户可感知的第二视图，而不是隐藏状态过滤
- 收藏视图的动作应与普通卡片保持一致核心能力：
  - 使用
  - 设为参考图
  - 编辑
  - 删除

### 6. 反推提示词的可见层结论

- 用户可见的反推结果必须给出双语版本：
  - 中文在前
  - 英文在后
- 不可感知层可以只保留机器可用版本，但用户感知层必须是中文优先。

## 参考图搜索链路的长期结论

### 1. 必须是两段式

- 正确流程：
  - 先准备当前任务与建议检索词
  - 再由用户确认 / 修改检索词并主动开始搜图
- 不能点开就自动搜。

### 2. 抽屉里必须展示当前任务

- 至少要显式展示：
  - 当前图片任务
  - 当前目标图或参考图上下文
  - 可编辑检索词
- 否则用户不知道系统到底在搜什么。

### 3. 聊天态应默认继承最近一张生成图

- 如果当前没有新附件，但最近有一张生成图，`找参考图` 应默认把最近一张生成图当作目标上下文。
- 这是“给这张婚纱照加花，先帮我找花素材”这类链路成立的前提。

### 4. 共用抽屉时不能互相抢壳

- 搜索结果只能被动回填。
- 切到 Prompt Library 后，参考图搜索结果不能把抽屉强行抢回。
- 共用抽屉容器时，要靠真实 DOM anchor 和状态来源判断，不能只靠单个布尔值。

### 5. 当前搜索源是过渡方案

- 当前实际链路是：
  - `playwright -> 百度图片搜索页 -> 抽详情页参数里的 objurl / fromurl`
- 这比继续依赖 `Wikimedia / Openverse` 更符合中国大陆用户环境。
- 但长期目标仍应升级到：
  - 网页资料搜索
  - 资料页抽视觉线索 / 可用图片
- 用户侧入口仍应保持一个：
  - `找参考图`

## Office / Local Bridge 的长期结论

### 1. 当前真正接上的 desktop runtime 只有 Local Bridge

- Electron `main.ts` 当前会真实启动 `LocalBridgeRuntime`。
- Local Bridge 状态会并入 Electron 状态发布。

### 2. Word Add-in 已进入写回阶段（2026-04-27，Claude）

- `office-addin/word/src/documentEditor.ts`：
  - `replaceSelection` 直接替换选中文字（继承段落样式）。
  - `replaceSelectionWithTracking` 以 Track Changes 模式替换，完成后关闭追踪。
  - `getSelectedText` 读取当前选中文字，作为 AI 编辑的输入来源。
- `office-addin/word/src/commentHandler.ts`：
  - `getOpenComments` 读取所有未解决批注（含锚定文字）。
  - `resolveComment` 替换锚定范围文字并回复批注（非破坏性，作者可手动决定是否接受）。
- taskpane 三标签页：
  - 问答标签：原有 Q&A + citation 跳转保留。
  - 编辑标签：选区 + 意图输入 → AI 生成替换文字 → 直接替换或 Track Changes 替换。
  - 批注标签：加载所有批注 → AI 一键处理（改文字 + 回复）。
- 打包：`package.json` + `webpack.config.js` + `tsconfig.json` 已落地，可在 `office-addin/word/` 执行 `npm install && npm run dev` 后 sideload。
- `src/officeBridge/` 层面保持不变（bridgeClient / wordDocumentContext / wordQuestionAnswer / wordSelectionContext / wordSelectedContextView）。

## 当前仍应诚实登记的未完成项

- Browser Bridge 本体
- Desktop automation / Computer Use 本体
- Scheduler / Cron 本体
- hosted `/verify` lifecycle parity
- 真正的云端 `RemoteAgentTask` / CCR parity
- 完整 Office 业务链
- 完整 desktop Skills / Agents / Hooks UI
- Voice mode
- Prompt suggestion
- Plugin / Skills 市场

## 相关规格与参考路径

这份实现记忆只保留长期有效结论。遇到“未来要做什么、准备怎么实现”时，不要重新脑补，先看对应规格：

### 主规格与参考

- 主产品规格：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\v1-product-spec.md`
- 官方源码能力索引：
  - `E:\claudecodejingiang\vscode-extension\.kiro\source-reference.md`
- 文档恢复草稿：
  - `E:\claudecodejingiang\vscode-extension\.kiro\recovery-draft-2026-04-24.md`
  - 仅在需要追旧文档主体、旧能力表述时使用，不作为当前实现真源。

### 各能力实现规格入口

- Computer Use / Browser Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\computer-use-browser-bridge.md`
- Office Add-in / Local Bridge：
  - `E:\claudecodejingiang\vscode-extension\.kiro\specs\office-addin-ecosystem.md`
- Hooks 执行链：
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

## 最重要的写法约束

- `CLAUDE_HANDOFF.md` 不再写流水账，只写当前态。
- `official-gap-analysis.md` 只写矩阵与对账。
- `implementation-memory.md` 只保留长期结论。
- 后续每组收口后都要同步这三份文档，但不要把每次小修都写成大段演进史。
- 多项连续开发时，每完成 5 个用户可感知事项，就先把当前稳定状态 push 到 GitHub；不要把恢复能力建立在本地会话记录、临时恢复稿或未同步文档上。
- 只要改动影响到前端可见行为、桌面壳交互、图片链路、审批流、会话切换、设置页或其它必须人工点按才能确认的路径，就要在收尾时明确提醒用户手测，并给出最短复现步骤。
