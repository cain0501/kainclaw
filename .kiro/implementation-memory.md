# 实现记忆 / Implementation Memory

更新时间：2026-04-27

## 1. 长期硬规则 / Long-Term Rule

- Claude 已覆盖的功能，必须先看 Claude 源码，再复刻逻辑。
- 不能先靠猜测、regex、提示词补丁、平行自研实现去试错。
- KainClaw 自己的工程标准，只用于 Claude 没有覆盖的能力，或 Claude baseline 之上的薄宿主适配。

## 2. 当前稳定的宿主模式 / Stable Host Pattern

- `src/extension.ts` 的正确减债方向不是继续堆 if/switch，而是把固定依赖抽成 host/factory，把会变化的会话态和 UI 回调作为第二段注入。
- 当前已经稳定的下沉模块包括：
  - `assistantReplyHost`
  - `autoMemoryHost`
  - `conversationHistoryHost`
  - `promptExecutionHost`
  - `promptEntryHost`
  - `promptRequestExtensionHost`
  - `workspaceRuntimeHost`
- 结论：
  - Claude 已覆盖的 prompt / session / tool / runtime 语义留在共享 `src/` 路径。
  - VS Code / Electron 只做装配和壳层适配。

## 3. 当前稳定的后台任务模式 / Stable Background Task Pattern

- background task 现在以 notification-first 为主，不再要求用户总是手动读 `TaskOutput`。
- detached 任务统一使用四类工件：
  - `configPath`
  - `statePath`
  - `outputPath`
  - `cancelPath`
- `taskRuntime` 会从 detached state / output 文件回刷任务状态。
- stop 统一语义：
  - 先写 `cancelled.flag`
  - 再按 PID 杀进程树
  - adapter-backed `remote_agent` 记为 Claude 风格 `killed`

## 4. hosted review 的本地适配结论 / Hosted Review Local Adaptation

- Claude 官方 `/ultrareview` 依赖云端 CCR / RemoteAgentTask backend。
- 本仓当前没有该 backend，所以 KainClaw 只能做“行为复刻 + 传输层本地适配”：
  - 行为层参考 Claude `/ultrareview` 和 `RemoteAgentTask`
  - 传输层改为 detached `Claude CLI` review worker
- 这个适配是允许的，因为差异来自宿主和基础设施，不是产品逻辑重写。
- 当前实现模块：
  - `remoteReviewHost.ts`
  - `backgroundReviewWorker.ts`
  - `backgroundTaskNotificationHost.ts`

## 5. inspection / review / verify 的稳定模式 / Stable Inspection Pattern

- slash command 入口统一走：
  - `promptCommandHost`
  - `promptExecutionHost`
  - `inspectionHost`
  - `inspectionSessionHost` / detached worker
- `/review`、`/verify`、`/ultrareview` 都要先做：
  - 原始任务识别
  - greeting-only 拦截
  - workspace evidence fallback
  - locale 跟随
- 对用户可见的后台 inspection 文案，优先给：
  - task id
  - output path
  - “完成后通知你”
- 不再把内部 follow-up 文案写成面向普通用户的主路径。

## 6. Electron 壳层的稳定模式 / Stable Electron Pattern

- Electron 如果要支持某个 slash command，优先复用 `src/` 里的 host/runtime 路径。
- 不要在 `ElectronChatPanel.ts` 里平行重写一套 desktop-only 逻辑。
- 目前已确认可复用并已接回 `src/` 主链的命令包括：
  - `/todo`
  - `/compact`
  - `/review`
  - `/verify`
  - `/ultrareview`

## 7. 文档和编码卫生 / Docs and Encoding Hygiene

- 高风险文档不要在乱码文本上继续增量改。
- 如果控制台显示 mojibake，不能据此判断文件坏了；要用脚本按 UTF-8 解码确认。
- 这几份文档必须按 `UTF-8 without BOM` 保存：
  - `E:\claudecodejingiang\CLAUDE_HANDOFF.md`
  - `E:\claudecodejingiang\vscode-extension\CLAUDE_HANDOFF.md`
  - `E:\claudecodejingiang\vscode-extension\.kiro\implementation-memory.md`
  - `E:\claudecodejingiang\vscode-extension\.kiro\official-gap-analysis.md`

## 8. 当前仍未完成的稳定缺口 / Stable Remaining Gaps

- hosted `/verify` lifecycle parity
- 真正的云端 `RemoteAgentTask` / CCR parity
- tasks / background command 更深 hosted lifecycle parity
- `extension.ts` 继续减债
- Browser Bridge / Computer Use / Scheduler runtime 真接线
