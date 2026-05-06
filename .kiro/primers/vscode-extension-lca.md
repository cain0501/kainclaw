# Task Primer: vscode-extension-lca — Hooks: 把 .cain/hooks.json 用户配置接入实际触发链

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

当前 `loadHooks()` 读取 `.cain/hooks.json` 只用于 `/hooks` 斜杠命令列表，从未在事件触发链上使用。
用户配置的 command/http/prompt/agent hook 全部是死链，不会触发。

本任务把用户配置的 hook 接入现有的 `triggerHooks()` 调用点。

## Out of Scope

- 不改 HookEvent 类型名称（那是 vscode-extension-vwq 的范围）
- 不增加新事件类型
- 不改 hooksRegistry.ts 的 SUPPORTED_HOOK_EVENTS 列表
- 不改 hooksExecutor.ts 的执行逻辑
- 不改 Electron 文件

## Already Completed

（无）

## Next Step (the ONLY thing to do this session)

### 分析阶段（先读，再改）

1. 读 `src/promptFlowHost.ts`，搜索所有 `triggerHooks(` 调用，记录每处传入的 hooks 参数来源（是 `installedSkillHooks` 还是其他）
2. 读 `src/promptTurnHost.ts`，同样搜索 `triggerHooks(` 调用
3. 读 `src/promptFlowHost.ts` 头部，确认 workspaceRoot 如何传入

### 实施阶段

目标：在每个 `triggerHooks()` 调用处，把用户 hook（从 `.cain/hooks.json` 加载）也合并进去。

**方案：**
在调用 `triggerHooks()` 的父函数中，加载用户 hook 一次（lazy + cached），然后在每个触发点合并：

```typescript
// 伪代码示意
const userHooks = await loadHooks(workspaceRoot);  // 缓存，不要每次都读
const allHooks = [...installedSkillHooks, ...userHooks];
await triggerHooks("PreToolCall", allHooks, context);
```

`loadHooks` 返回的 `HookDefinition[]` 每条有 `events: string[]`，`triggerHooks` 内部会过滤 `h.events.includes(event)`，所以用户 hook 的 events 字段值必须匹配触发点名称（如 `"PreToolCall"`）。

**缓存策略：** 在一次 prompt 处理的生命周期内缓存一次即可（不需要跨 prompt 持久化）。

### 文件

- `src/promptFlowHost.ts` — 主要改动
- `src/promptTurnHost.ts` — 如果也有 triggerHooks 调用则改
- 可能需要 `src/hooksRegistry.ts`（只读 loadHooks，不改）

## Verification

```bash
npm test
npm run check
npm run build
```

不需要 Electron build。

## Risk Points

- loadHooks 是异步文件读取，避免在热路径上每次都触发 I/O，建议 lazy load + 缓存到 prompt 生命周期
- 用户 hook 执行失败不应阻断主流程（hooksExecutor 已有 try/catch，确认没有绕过）
- 不要把 `loadHooks` 缓存跨越多个 prompt 周期——文件可能被用户修改

## High-Risk Files Touched

- `src/promptFlowHost.ts` — 高风险，改前读清楚整个函数结构

## Reference (only load if stuck)

- `src/hooksRegistry.ts` — loadHooks 实现
- `src/hooks/hooksTrigger.ts` — triggerHooks 内部逻辑
- Beads: `bd show vscode-extension-lca`

## Definition of Done

- [ ] 用户在 `.cain/hooks.json` 配置 `events: ["PreToolCall"]` 的 command hook 后，工具调用时 command 实际执行
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
- [ ] beads notes 写了：改了哪些文件 + 缓存策略
