# Primer: vscode-extension-uru
# imglab-* namespace 与图片渲染函数最终清理

## 背景

page-images 删除后，遗留的 `imglab-*` 函数名和孤立函数做最终清理。
这是 5 个 issue 清理链的最后一步，纯重命名 + 删除，不改逻辑。

前置：cs9（删 page-images）完成。

---

## 涉及文件

`electron/renderer/index.html`

---

## 清理清单

### 1. 删除已无调用的孤立函数

删除前用全文搜索确认调用数为 0：

| 函数 | 说明 |
|------|------|
| `renderImageLabResults()` | cs9 后不再被调用 |
| `rerunImageLab()` | 独立 Image Lab 入口，Midtai 已有 rerunMidtaiImage()；确认无调用后删 |
| `handleImageLabPromptInput()` | 监听旧 imglab-prompt 输入事件，节点已删 |
| `_syncLegacyImageLabDOM()` | cs9 中应已删，此处二次确认 |

### 2. 重命名核心函数（确保所有调用者同步更新）

| 旧名 | 新名 | 说明 |
|------|------|------|
| `runImageLab(overrides)` | `runImageRequest(overrides)` | 或 `runImageGenerate`，视上下文决定 |
| `buildImageLabPayload(overrides)` | `buildImagePayload(overrides)` | |
| `renderImageLabHistory()` | `renderImageHistory()` | 同步更新调用者 |
| `applyImageLabState()` | `applyImageState()` | 同步更新调用者 |
| `imageLabState` | `imageState` | **谨慎**：全局变量，全文替换，确认无遗漏 |

> **重命名策略**：先用全文搜索统计每个名字的出现次数，一次替换完，再跑 syntax check。
> `imageLabState` 出现次数多，建议单独一步处理，替换后立即验证。

### 3. 更新文档

- `AGENTS.md` 中如有 imglab 相关说明，同步更新
- `CURRENT_STATE.md` Stable Capabilities 中"Image Lab chain"的描述改为"Image generation chain"

---

## 验收

- 全文搜索 `imglab`：0 处
- 全文搜索 `imageLabState`：0 处（如执行重命名步骤）
- Midtai 图像生成 / 编辑 / 重生成 / 历史 / Prompt Library 全功能正常
- `npm run build:electron` + renderer JS syntax check 通过
- `npx vitest run electron/ElectronChatPanel.test.ts` 通过

---

## 明确不做

- 不改图像功能逻辑
- 不改 IPC 协议（`image:run` 等）
- 不改 Midtai 外壳结构
