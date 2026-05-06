# Task Primer: vscode-extension-f4v — extension.ts 宿主总控继续下沉

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

把 `src/extension.ts` 里仍然堆在主入口的宿主逻辑继续下沉到 host/adapter/helper 层。
目标是让 `ChatSidebarProvider` 和 `activate()` 函数更薄、更可测试。
**只做行为不变的结构移动，不改业务逻辑，不改 Electron 壳层。**

## Out of Scope

- 不改任何 Electron 文件（`electron/` 目录）
- 不改 `src/webviewHtml.ts`
- 不改业务规则（license、approval、swarm gating）
- 不顺手修复看到的其他问题
- 不重写整条 extension 主链

## Already Completed

- [x] `readySequenceHost.ts` — `createReadySequenceControllerFactory` 已提取（2026-04-30）
- [x] `settingsPanelHost.ts` — `createSettingsPanelControllerFactory` 已提取（2026-04-30）
- [x] `sessionPanelHost.ts` — `createSessionPanelControllerFactory` 已提取（2026-05-01）
- [x] `companionHost.ts` — `createCompanionControllerFactory` 已提取（2026-05-01）
- [x] `extensionPromptStateHost.ts` — prompt request state wiring extracted from `handlePrompt()` via `createExtensionPromptRequestState`（2026-05-04）
- [x] `editorInteractionBindingsHost.ts` — quick action + editor selection wiring extracted from constructor into `createEditorInteractionBindings`（2026-05-06）

## Next Step (the ONLY thing to do this session)

**下一步建议：License host binding（`verifyLicense` + feature flag dispatch），见 `createLicenseHostBindingsFactory` 相关 wiring in constructor。**

提取顺序建议（按耦合度从低到高）：
1. ~~Quick action / editor selection binding~~ ✅ 已完成
2. License host binding（`verifyLicense` + feature flag dispatch）
3. Workspace status wiring（workspace badge / folder status）
4. 其余根据你读到的代码结构判断

**每次只提取一个逻辑块。提取完验证通过后更新 beads notes，再决定是否继续。**

**Files:** `src/extension.ts` + 1 个新 `src/*Host.ts`（max 2-3 files per step）

## Verification

```bash
npm test
npm run check
npm run build
```

不需要 Electron build，除非你碰了 Electron IPC 相关路径。

## Risk Points

- `extension.ts` 里有很多相互交叉的闭包和共享状态，提取时要确认被提取函数没有隐式依赖 `this` 上的多个字段
- 新 host 文件的接口参数要尽量窄，避免把 `ChatSidebarProvider` 整个 `this` 传进去
- 提取后要搜 `extension.ts` 确认没有残留引用

## High-Risk Files Touched

- `src/extension.ts` → 只动你当前目标逻辑块，不改其他区域
- 新建 `src/*Host.ts` → 这是安全新文件

## Reference (only load if stuck)

- 已有 host 模式参考：`src/companionHost.ts`、`src/sessionPanelHost.ts`
- 长期结论：`implementation-memory.md` §5（extension.ts/handlePrompt 宿主减债）
- Beads：`bd show vscode-extension-f4v`

## Definition of Done

- [ ] 至少提取了一个新的 host 逻辑块
- [ ] `npm test` 通过（168 文件，1299 测试）
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
- [ ] beads notes 里写了：本次提取了什么 + 下一个建议目标是什么
- [ ] 不需要手动测试（纯结构移动）

### Session 2026-05-04

- Extracted prompt request state assembly from `handlePrompt()` into `src/extensionPromptStateHost.ts`.
- Verification passed: `npm test`, `npm run check`, `npm run build`.

### Session 2026-05-06

- Extracted quick action + editor selection wiring from constructor into `src/editorInteractionBindingsHost.ts`.
- `createEditorInteractionBindings` takes narrow deps (no `this`): workspace root getter, active editor getter, ready sequence, handlePrompt, postMessage callback.
- Fixed a TS2493 error in the new test file (used `toHaveBeenCalledWith(expect.stringContaining(...))` instead of `mock.calls[0]?.[0]`).
- Verification passed: 171 test files, 1325 tests; `npm run check` and `npm run build` clean.
- Suggested next target: License host binding (`createLicenseHostBindingsFactory` wiring in constructor).
