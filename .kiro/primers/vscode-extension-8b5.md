# Primer: vscode-extension-8b5
# image request 解耦：去掉对 imglab-* DOM 的参数读取

## 背景

`runMidtaiImage()` 和 `submitMidtaiImageEdit()` 目前通过"写旧 DOM → 调 runImageLab()"的方式传参：
```
runMidtaiImage()
  → 写 imglab-prompt.value = prompt
  → 写 imglab-size-preset.value = midtaiState.imgSize
  → 写 imglab-batchcount.value = midtaiState.imgCount
  → runImageLab()
      → buildImageLabPayload()  // 读 imglab-size-preset / imglab-batchcount / imglab-responseformat DOM
      → send({ type: 'image:run', ... })
```

这让 `page-images`（旧 Image Lab 独立页）里的 `imglab-*` 节点成了隐藏参数通道。
本 issue 的目标：让 `runImageLab()` 和 `buildImageLabPayload()` 接受显式参数，彻底切断这条 DOM 桥。

---

## 涉及文件

`electron/renderer/index.html`（单文件 renderer）

---

## 关键位置

| 函数 | 行号 | 说明 |
|------|------|------|
| `runMidtaiImage()` | 5813 | Midtai 图像入口，写旧 DOM 后调 runImageLab |
| `submitMidtaiImageEdit()` | 4983 | 编辑入口，同样写旧 DOM 后调 runImageLab |
| `runImageLab()` | 11699 | 读 `imglab-prompt.value`，调 buildImageLabPayload |
| `buildImageLabPayload()` | 10109 | 读 imglab-size-preset / imglab-batchcount / imglab-responseformat DOM |
| `rerunImageLab()` | 11729 | 读 imglab-prompt / 写 imglab-prompt，调 runImageLab |

---

## 改法

### Step 1：给 `buildImageLabPayload()` 加 overrides 参数

```javascript
function buildImageLabPayload(overrides = {}) {
  const sizePreset = overrides.sizePreset
    ?? document.getElementById('imglab-size-preset')?.value
    ?? imageLabState.config.size ?? '1024x1024';
  const customSize = document.getElementById('imglab-size')?.value?.trim() ?? '';
  return {
    size: sizePreset === 'custom'
      ? (customSize || imageLabState.config.size || '1024x1024')
      : sizePreset,
    batchCount: Math.max(1, Math.min(8, Number(
      overrides.batchCount
      ?? document.getElementById('imglab-batchcount')?.value
      ?? imageLabState.config.batchCount ?? '1'
    ))),
    responseFormat: overrides.responseFormat
      ?? document.getElementById('imglab-responseformat')?.value
      ?? imageLabState.config.responseFormat
      ?? undefined,
    referenceImages: imageLabState.referenceImages.map(r => ({ ...r })),
  };
}
```

### Step 2：给 `runImageLab()` 加 overrides 参数

```javascript
function runImageLab(overrides = {}) {
  if (!imageLabState.config.isConfigured) { ... }
  const prompt = overrides.prompt
    ?? document.getElementById('imglab-prompt')?.value?.trim();
  if (!prompt) { ... }
  const payload = buildImageLabPayload(overrides);
  imageLabState.lastRequest = { prompt, ...payload };
  ...
  send({ type: 'image:run', prompt, recordPromptHistory: true, ...payload });
}
```

### Step 3：改 `runMidtaiImage()` — 不再写旧 DOM

```javascript
function runMidtaiImage() {
  const prompt = document.getElementById('midtai-img-prompt')?.value.trim();
  if (!prompt) { ... }
  midtaiState.imgPreviewRequestNonce = Date.now();
  midtaiState.imgPreviewSession = true;
  imgSwitchView('preview');
  runImageLab({
    prompt,
    sizePreset: midtaiState.imgSize || '1024x1024',
    batchCount: midtaiState.imgCount || 1,
  });
}
```

### Step 4：改 `submitMidtaiImageEdit()` — 不再写旧 DOM

```javascript
function submitMidtaiImageEdit() {
  const prompt = document.getElementById('midtai-img-edit-prompt')?.value.trim();
  if (!prompt || !midtaiImageEditState.src) return;
  setImageLabReferenceFromSource(midtaiImageEditState.src, `edit-${midtaiImageEditState.id}.png`, { mode: 'prepend' });
  closeMidtaiImageEdit();
  showImgView('img-preview');
  runImageLab({
    prompt,
    sizePreset: midtaiState.imgSize || '1024x1024',
    batchCount: midtaiState.imgCount || 1,
  });
}
```

### Step 5：改 `rerunMidtaiImage()` 和 `rerunImageLab()`

`rerunMidtaiImage()` 已从 `imageLabState.lastRequest` 取值，路径正确，只需确认不再写 imglab-prompt。
`rerunImageLab()` 目前写 `imglab-prompt.value`（line 11745），改为直接从 `imageLabState.lastRequest.prompt` 取值，传给 `runImageLab()` 的 overrides。

---

## 验收

- Midtai 图像生成正常（prompt/size/batchCount 参数传递正确）
- 编辑图功能正常
- 重生成功能正常
- `imglab-size-preset` / `imglab-batchcount` DOM 节点的 value 不再被 runMidtaiImage 写入（可用 console.log 确认）
- `npm run build:electron` + renderer JS syntax check 通过

---

## 明确不做

- 不删 `page-images` DOM（那是 Issue D）
- 不改 `imglab-prompt` 节点的读取（`openPromptLibraryEditor` 那条是 Issue C）
- 不改 `applyImageLabState()` 的 13 个 DOM 写入（那是 Issue B = axn）

---

## Already Completed

- `buildImageLabPayload(overrides = {})` 已支持 `sizePreset` / `batchCount` / `responseFormat` / `referenceImages` 显式覆盖，未传时再 fallback 到现有 DOM / config。
- `runImageLab(overrides = {})` 已支持从 overrides 读取 `prompt`，并将 `recordPromptHistory` 做成可覆盖项。
- `runMidtaiImage()` / `submitMidtaiImageEdit()` 已改为直接调用 `runImageLab({ prompt, sizePreset, batchCount })`，不再写 `imglab-prompt` / `imglab-size-preset` / `imglab-batchcount`。
- `rerunImageLab()` 已改为从 `imageLabState.lastRequest` 取值并重调 `runImageLab()`，不再写 `imglab-prompt` DOM。
- `rerunMidtaiImage()` 已改为从 `imageLabState.lastRequest` 取 prompt / size / batchCount，直接重调 `runImageLab()`。
- 已验证：`npm run build:electron`、renderer JS syntax check、`electron/renderer/index.html` UTF-8 decode check 全部通过。
