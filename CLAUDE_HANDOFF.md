# Claude Handoff / Claude 交接说明

更新时间：2026-04-27

## 当前硬规则 / Hard Rule

- 只要本项目目标能力已经存在于本地 Claude Code 源码中，实现、调试、测试、文档结论都必须先参考 Claude 源码，再按其逻辑复刻到 KainClaw。
- 不允许先靠猜测、regex、提示词补丁、平行自研实现去“试错”，再事后往 Claude 行为上靠。
- 只有 Claude 源码没有覆盖的能力，才按 KainClaw 自己的标准独立设计。

## 当前项目定位 / Current Product Position

- `vscode-extension/` 仍然是本地验证壳，不是最终产品形态。
- 当前可打包、可运行的是 Electron 内测壳。
- 最终目标仍然是更完整的 Windows 客户端。
- 新能力优先落到 `src/` 的 runtime / service / adapter，Electron 只做桌面壳、IPC、UI 和权限接线。

## 当前已验证基线 / Verified Baseline

- 通过命令：
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run build:electron`
  - `npm run check:electron`
- 当前自动化基线：
  - `148` 个测试文件
  - `1068` 个测试通过

## 本轮已同步的代码状态 / Synced Code State

### 1. extension.ts 宿主减债继续下沉

- 这批宿主装配继续从 `src/extension.ts` 下沉到独立 host/factory：
  - `assistantReplyHost`
  - `autoMemoryHost`
  - `conversationHistoryHost`
  - `promptExecutionHost`
  - `promptEntryHost`
  - `promptRequestExtensionHost`
  - `workspaceRuntimeHost`
- 这属于 KainClaw 宿主减债，不改变 Claude 已覆盖的 runtime / prompt / tool / session 语义。

### 2. Tasks / background command parity 继续收口

- background task 继续转向 notification-first 生命周期：
  - 增加 `notified` 状态收口
  - 新增 `backgroundTaskNotificationHost`
  - 后台任务完成后优先通过通知回流，而不是要求用户先看 `TaskOutput`
- `RunCommandInBackground` 语义继续贴近 Claude：
  - 返回 `output_path`
  - 返回 `notification_hint`
- duplicate review / verification / background-task follow-up 文案已改成“完成后会通知你”。
- `TaskStop` 对 adapter-backed `remote_agent` 保留 Claude 风格 `killed` 终态。

### 3. Review hosted / RemoteAgentTask parity 新收口

- `/ultrareview` 已接进：
  - VS Code prompt command 链路
  - Electron prompt command 链路
- 由于本仓没有 Claude 云端 CCR backend，本轮采用“薄适配”：
  - 仍按 Claude `/ultrareview` + `RemoteAgentTask` 生命周期设计
  - 传输层适配为本地 detached `Claude CLI` review worker
- 本轮新增核心模块：
  - `src/remoteReviewHost.ts`
  - `src/backgroundReviewWorker.ts`
  - `src/backgroundTaskNotificationHost.ts`
- hosted review 当前行为：
  - 只支持 `claude-cli` provider
  - 启动后立即返回 task id 和 output path
  - 完成后通过 background notification 回流完整 review findings
  - 不再只给截断预览
  - detached hosted review 可通过 stop 路径终止

## 当前仍未完成 / Remaining Gaps

### Claude parity 主线

- hosted `/verify` 生命周期 parity 仍未完成
- 真正的云端 `RemoteAgentTask` / CCR backend parity 仍未完成
- tasks / background command 的更深 hosted lifecycle parity 仍未完成
- review / verification 的 cloud-only 差异仍需继续对齐

### 宿主与桌面壳

- `src/extension.ts` 仍然偏厚，后续还要继续下沉
- `electron/ElectronChatPanel.ts` 仍是桌面壳总控，不应继续堆核心业务逻辑
- `electron/renderer/index.html` 仍是验证壳，不是长期前端架构

### Desktop runtime

- 当前真正接上的 desktop runtime 仍主要是 `localBridgeRuntime`
- 仍未完成的主线：
  - Browser Bridge
  - Computer Use / desktop automation
  - Scheduler runtime
  - 完整 desktop Skills / Agents / Hooks UI

## 当前建议下一组 / Next Recommended Group

1. hosted `/verify` lifecycle parity
2. review / verification 的 remote task 生命周期继续向 Claude 收口
3. `extension.ts` 宿主继续减债
4. Browser Bridge / Scheduler / desktop automation runtime 真接线

## 交接注意事项 / Handoff Notes

- 根目录这份 `CLAUDE_HANDOFF.md` 不是 git 仓库文件，只做本地交接，不会随 `vscode-extension` 仓库一起 push。
- `vscode-extension/CLAUDE_HANDOFF.md` 必须与本文件保持一致。
- `同步文档.txt` 是用户故意放的未跟踪文件，不要提交，不要删除。
