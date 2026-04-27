# KainClaw vs Claude Code Gap Analysis

更新时间：2026-04-27

## 评估规则 / Evaluation Rule

- 只要 Claude 本地源码已有对应能力，Claude 源码行为就是验收基线。
- KainClaw 只能在宿主、IPC、存储路径、桌面壳、缺失基础设施这类地方做薄适配。

## 当前验证基线 / Current Verified Baseline

- `npm test`
- `npm run check`
- `npm run build`
- `npm run build:electron`
- `npm run check:electron`
- 当前结果：
  - `148` test files passed
  - `1068` tests passed

## 官方能力对账 / Official Capability Matrix

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| 本地 `/review` | 已对齐主链 | 走 `inspectionHost -> inspectionSessionHost -> review/runner`，保留 diffRef / PR / locale / workspace evidence 语义 |
| 本地 `/verify` | 已对齐主链 | 已有 scope gate、greeting-only PARTIAL、workspace evidence fallback、locale 跟随、structured verify report |
| hosted `/ultrareview` | 部分对齐 | 生命周期和用户体验按 Claude `/ultrareview` + `RemoteAgentTask` 复刻；由于无 CCR backend，传输层适配为 detached `Claude CLI` worker |
| hosted `/verify` | 未完成 | 还没有对应的 hosted verification lifecycle parity |
| `RemoteAgentTask` 真云端会话 | 未完成 | 当前没有 Claude 云端 CCR / remote session backend |
| background command lifecycle | 部分对齐 | 已有 detached worker、state/output/cancel 文件、notification-first 回流、stop/killed 语义 |
| `TaskOutput` / `TaskStop` 合同 | 部分对齐 | 已补齐 abort wait、deprecated alias、adapter-backed remote stop；更深 remote lifecycle 仍未完 |
| MCP runtime | 大体对齐 | transport、auth placeholder、remote OAuth、prompt commands、tool-name normalization、transcript visibility 已收口；`oauth.xaa` 与更深 edge cases 未完 |
| LSP runtime | 大体对齐 | file preflight、workspaceSymbols 空查询、provider unavailable、官方单数 operation naming、malformed response hardening 已收口 |
| ToolSearchTool | 已对齐主链 | `select:`、裸工具名、`mcp__server`、`+required`、`max_results` 已对齐 |

## KainClaw 宿主收口 / KainClaw Host Debt Reduction

- 这部分不是 Claude 产品能力本身，而是 KainClaw 宿主减债：
  - `assistantReplyHost`
  - `autoMemoryHost`
  - `conversationHistoryHost`
  - `promptExecutionHost`
  - `promptEntryHost`
  - `promptRequestExtensionHost`
  - `workspaceRuntimeHost`
- 结论：
  - 属于正确方向
  - 但 `src/extension.ts` 仍偏厚，后续还要继续下沉

## 本轮新收口 / Newly Closed In This Batch

### hosted review / RemoteAgentTask parity

- `/ultrareview` 已进入 VS Code 和 Electron command surfaces
- 非 `claude-cli` provider 会被显式拒绝
- detached hosted review 会：
  - 立即返回 task id / output path
  - 完成后通过 notification 回流完整 findings
  - 支持 stop 路径

### tasks / notification-first parity

- 后台任务 UX 继续向 Claude 收口：
  - duplicate task follow-up 改成“完成后会通知你”
  - `output_path` / `notification_hint` 继续成为标准输出语义
  - background notification 不再只给截断结果

## 当前主要缺口 / Main Remaining Gaps

1. hosted `/verify` parity
2. 真正的 cloud `RemoteAgentTask` / CCR backend parity
3. review / verification 的更深 remote lifecycle parity
4. Browser Bridge / Computer Use / Scheduler runtime 真接线
5. `src/extension.ts` 继续减债

## 当前结论 / Current Conclusion

- 如果只按 Claude 官方能力算，KainClaw 当前已经补到了：
  - 本地 `/review`
  - 本地 `/verify`
  - tasks/background command 的大部分主链语义
  - MCP runtime 大部分主链语义
  - LSP / ToolSearch 的关键合同
- 当前最大的“还没完全像 Claude”的块，已经明确收束到：
  - hosted verification
  - 真正的 cloud remote task backend
  - 更深 remote lifecycle parity
