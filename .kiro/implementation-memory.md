# 实现记忆

## Current Override - 2026-04-25

- Electron shell command wiring rule:
  - If a capability already exists in `src/` as a mature host/runtime path, prefer wiring the desktop shell back into that path instead of inventing a desktop-only rewrite.
- This round confirmed a concrete example:
  - `/todo` can be restored by giving the Electron shell a real task runtime in `ToolContext`.
  - `/compact` can be restored by reusing `handleCompactCommandWithHost(...)`.
  - `/review` and `/verify` can be restored by reusing `handleReviewCommandWithHost(...)` and `handleVerificationCommandWithHost(...)`.
- Electron shell conversation hygiene rule:
  - User-facing slash-command replies should still be shown and persisted in the session,
  - but replies that are not meant to become future model context must be marked and filtered out of later provider history.
- This round validated:
  - `npm test`
  - `npm run check`
  - `npm run build`
- Current verified baseline after this round:
  - `143` test files
  - `928` tests passed
- `npm run build:electron` was not rerun in this round by the agent.
- Electron routing rule:
  - Slash commands must be recognized before chat/image intent inference.
  - Otherwise recent generated-image context will incorrectly hijack commands such as `/compact` into image-edit flows.

更新时间：2026-04-24

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

- 当前登记基线：`137` 个测试文件，`891` 个测试通过。
- 当前登记通过命令：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
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

#### 4.2 Cain 扩展能力

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

### 2. 官方对齐优先，Cain 扩展第二

- 做产品和文档判断时，默认顺序是：
  - 先判断这是不是官方 Claude Code 主核心能力。
  - 再判断这是不是 Cain 的扩展能力。
- 如果两者混在一起写，必须显式标出“主核心”和“扩展”。
- 图片、Office、Local Bridge 这些扩展能力可以很重要，但不应覆盖主核心叙事。

### 3. 这个项目并不只是“聊天 UI”

- 当前项目不是一个只剩 Electron 聊天页的产品。
- 真正主核心是：
  - agent / runtime / tool / task / review / verification / compact / memory / lsp / worktree 这一整条 Claude 能力栈。
- Electron、聊天页、图片页都只是当前验证界面。

## Phase 2 收尾的主线经验

### 1. `tasks / toolRuntime` Phase 2

- detached local background command 需要把状态、输出文件刷新、duplicate-run reuse、停止回收这几条链都做完整。
- `TaskStop` 不能在 stop 通道不存在时伪造“已取消”。
- built-in inspection 任务要保留 `command_text / prompt / plan_file_path / diff_ref` provenance。
- `TaskGet`、`TaskOutput` 对缺失任务必须返回结构化 `not_found`，不能返回含糊状态。
- remote / detached background task parity 仍然是未完成项，不能在文档里写成已闭环。

### 2. Verification / Review Phase 2

- Verification 只有 `PASS` 才能算成功收口。
- `FAIL`、`PARTIAL` 必须保留为真实终态，而不是被吞掉。
- diff-aware review / verification 是关键收口点：
  - 本地 git range
  - 公开 GitHub PR / compare URL
  - `diffRef` 追溯
  - plan file path 透传
- pending-plan lifecycle 要有 started-crash reset 等完整语义。
- remote / background verification parity 仍未完成。

### 3. Compact Phase 2

- compact 不能丢 attachment-only user message。
- compact token 估算必须把 image attachment 算进去，否则阈值会严重失真。
- assistant tool-call message 也要保留和计数。
- repeated `<analysis>...</analysis>` block 必须做彻底清理，不能只清第一段。
- auto-compact no-op 场景也要正确收尾，不能只处理真实 compact 分支。

### 4. LSP / Worktree Phase 2

- file-backed LSP 操作要在 runtime 入口前校验 `filePath`，不能把 undefined 文档 URI 放进 VS Code。
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

### 2. Office 当前仍是最小只读链

- `office-addin/word/` 已有最小 Word Add-in skeleton。
- `src/officeBridge/` 当前稳定落地的是：
  - `bridgeClient.ts`
  - `wordDocumentContext.ts`
  - `wordQuestionAnswer.ts`
  - `wordSelectionContext.ts`
  - `wordSelectedContextView.ts`
- 当前重点仍是：
  - 选区上下文
  - citation 命中
  - 只读问答
- 还不是完整编辑产品流。

## 当前仍应诚实登记的未完成项

- Browser Bridge 本体
- Desktop automation / Computer Use 本体
- Scheduler / Cron 本体
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
