# Task Primer: vscode-extension-pnz — Fast mode: state persistence across sessions

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Fast mode 因 overloaded/rate_limit 被关闭后，重启 extension 时状态总是重置。
`shouldPersistFastModeOffForOverage` 字段已存在于 fastMode.ts 但从未使用。

本任务：当 fast mode 因超载关闭时持久化关闭状态，session 恢复时沿用，用户手动 /fast on 后清除。

## Out of Scope

- 不做 effort 联动
- 不做 telemetry/metrics
- 不做 API rejection 检测
- 不改任何 Electron 文件
- 不改 fast mode 的 UI 渲染逻辑

## Already Completed

（无）

## Next Step (the ONLY thing to do this session)

### 分析阶段

1. 读 `src/thinkingEffort/fastMode.ts`，找到：
   - `shouldPersistFastModeOffForOverage` 字段的位置
   - fast mode 被 overloaded/rate_limit 关闭的代码路径
   - `/fast on` 处理逻辑
2. 读 `src/storage/settingsRepository.ts`，确认有没有合适的读写接口（一个 boolean setting）

### 实施阶段

**三处改动：**

1. **写入持久化**（fastMode.ts）
   在 fast mode 因 `overloaded` 或 `rate_limit` 被关闭的路径上，调用 settingsRepository 写入一个 `fastModeDisabledForOverage: true`。

2. **读取持久化**（fastMode.ts 初始化）
   在 fast mode 初始化时，读取 settingsRepository 里的 `fastModeDisabledForOverage`，如果为 true 则初始化时保持关闭状态。

3. **清除持久化**（fastMode.ts）
   在 `/fast on` 的处理路径上，将 `fastModeDisabledForOverage` 清除（写 false 或删除该字段）。

**settingsRepository 接口：**
先确认 `settingsRepository` 有无 `get/set` generic 接口，或者是否需要加一个专用字段。优先复用已有接口，不要另建存储文件。

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- settingsRepository 是异步接口，fastMode 初始化可能是同步的——需确认初始化时序，确保 await 有效
- 持久化 key 名称要和已有 settings 字段命名风格一致

## High-Risk Files Touched

- `src/thinkingEffort/fastMode.ts` — 读写持久化状态
- `src/storage/settingsRepository.ts` — 新增或复用字段

## Reference (only load if stuck)

- Beads: `bd show vscode-extension-pnz`

## Definition of Done

- [ ] 因 overload 关闭 fast mode 后重启，fast mode 仍保持关闭
- [ ] `/fast on` 后重启，fast mode 正常开启（不被持久化状态压制）
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
