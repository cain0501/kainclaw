# Task Primer: vscode-extension-9ye — 应用改写进度感：字符计数显示

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

用户点「应用改写」后，目前只有两段静态状态文字切换（"分析中" → "生成中"），没有真实进度感。  
目标：**用字符计数传递进度**，让用户看到 AI 在持续工作：

- 快请求（< 1s）：「改写中… 已生成 128 字符」一闪而过 → 「✓ 改写完成」
- 慢请求（> 几秒）：数字持续增长，用户知道 AI 没卡死

后台生成的是 HTML，用户**不需要看到 HTML 内容**，只看字符数量。

## 现有代码状态（重要，先读）

### `electron/ElectronChatPanel.ts` — `patchDesignWorkbench`（line ~3485）

有两条路径：

**快路径**（`extractDirectTextReplacement` 命中时）：直接替换文字，不走 LLM，不需要计数，直接发 `design:patchResult`。

**LLM 路径**：调 `patchKainClawDesignNode`，`onToken` 回调目前只发一次 `design:patchStarted`，后续 token 全丢弃：
```typescript
let patchStartedSent = false;
onToken: () => {
  if (patchStartedSent) return;
  patchStartedSent = true;
  this.sendToRenderer({ type: "design:patchStarted" });
},
```

### `electron/renderer/index.html` — 现有状态机制

- `designBridgeState.patchStatusText` 存状态文字
- `setDesignPatchStatus(text)` / `clearDesignPatchStatus()` 设置/清除
- `design:progress` step=patching → 显示「✦ AI 正在分析节点...」
- `design:patchStarted` → 显示「✦ 正在生成改写内容...」
- `design:patchResult` / `design:error` → `clearDesignPatchStatus()`

---

## 修改详情

### Fix 1：`electron/ElectronChatPanel.ts` — onToken 改为每次发字符计数

把 `patchDesignWorkbench` 里的 `onToken` 改为：

```typescript
let patchTokenCount = 0;
const result = await patchKainClawDesignNode({
  provider,
  html,
  selector,
  comment,
  targetOuterHtml,
  onToken: (token: string) => {
    patchTokenCount += token.length;
    this.sendToRenderer({ type: "design:patchToken", count: patchTokenCount });
  },
});
```

删掉 `patchStartedSent` 变量和 `design:patchStarted` 发送（由 `design:patchToken` 第一次到达替代）。

### Fix 2：`electron/renderer/index.html` — handleMessage 加 `design:patchToken` case

在 `design:patchStarted` case 附近加：

```javascript
case 'design:patchToken': {
  if (!designBridgeState.patchLoading) break;
  const countText = typeof msg.count === 'number'
    ? (isEnglishUi() ? `✦ Generating… ${msg.count.toLocaleString()} chars` : `✦ 生成中… 已生成 ${msg.count.toLocaleString()} 字符`)
    : (isEnglishUi() ? '✦ Generating…' : '✦ 生成中…');
  setDesignPatchStatus(countText);
  renderDesignBridgePage();
  break;
}
```

同时**删除或保留** `design:patchStarted` case（可以保留作兜底，但正常流程不再依赖它）。

### Fix 3：`electron/renderer/index.html` — patchResult 时短暂显示「✓ 完成」

在 `design:patchResult` case 的 `clearDesignPatchStatus()` 前，先设置完成文字，短暂停留后清除：

```javascript
case 'design:patchResult':
  // ... 现有逻辑 ...
  setDesignPatchStatus(isEnglishUi() ? '✓ Rewrite complete' : '✓ 改写完成');
  renderDesignBridgePage();
  setTimeout(() => {
    clearDesignPatchStatus();
    // 如果 Midtai 页面还在，重新渲染
    if (document.getElementById('page-midtai')?.classList.contains('active')) {
      // 状态已清除，不需要额外操作
    }
  }, 800);
  // 注意：不要在这里再调 clearDesignPatchStatus()，交给 setTimeout
```

**注意**：`design:patchResult` 里原有的 `clearDesignPatchStatus()` 调用要改为上面的 setTimeout 方案，避免立即清除。

---

## 实现顺序

1. `ElectronChatPanel.ts`：`onToken` 改为每次发 `design:patchToken`，删 `patchStartedSent`
2. `renderer/index.html`：加 `design:patchToken` case，更新计数文字
3. `renderer/index.html`：`design:patchResult` 改为先显示「✓ 改写完成」再 setTimeout 清除

---

## 不需要做的事

- **不显示 HTML 内容**：只传 `count` 数字，不传 token 文字
- **不改 patchEngine.ts**：`onToken` 参数已存在
- **快路径不需要计数**：`extractDirectTextReplacement` 命中时直接发 `patchResult`，不走 onToken

---

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

手动验证：
1. 选元素 → 输入"改成红色" → 点应用改写（快路径）→ 应直接完成，短暂显示「✓ 改写完成」
2. 选元素 → 输入较复杂描述 → 点应用改写（LLM 路径）→ 应看到「✦ 生成中… 已生成 XXX 字符」数字增长 → 完成后「✓ 改写完成」短暂停留消失
3. 生成失败时状态行消失，按钮恢复

---

## Definition of Done

- [ ] LLM 路径：每个 token 发 `design:patchToken`，带累计字符数
- [ ] renderer 收到 `design:patchToken` 显示「✦ 生成中… 已生成 N 字符」
- [ ] `design:patchResult` 先显示「✓ 改写完成」，800ms 后清除
- [ ] `design:error` 仍立即清除状态行
- [ ] 快路径（直接文字替换）不受影响
- [ ] `npm test` + `npm run check` + `npm run build` + `npm run build:electron` 全部通过
