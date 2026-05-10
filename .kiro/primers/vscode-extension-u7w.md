# Task Primer: vscode-extension-u7w — 图像我的作品：缩略图持久化

> **Session entry point.** Read this first.

## Task Goal

中台图像「我的作品」列表当前每次展示都加载原始全尺寸图片（1024×1024），导致明显卡顿。  
目标：对齐设计列表的缩略图机制，首次展示时在 renderer 生成 320px 缩略图，通过 IPC 回存到 `gallery.json`，之后每次展示直接用小图。

**涉及文件：**
- `src/imageGeneration/imageLabRuntime.ts`（类型）
- `src/imageGeneration/imageLabGalleryStore.ts`（持久化）
- `electron/ElectronChatPanel.ts`（IPC handler）
- `electron/renderer/index.html`（渲染 + 缩略图生成）

---

## 参考：设计列表缩略图机制

理解这个是前提，图像列表要对齐这套模式。

### 流程
1. **生成时异步存缩略图**：`saveDesignVersion` 生成完 HTML 后，`captureDesignThumbnail(html)` 截图 → `designProjectStore.saveThumbnail(projectId, dataUrl)` 存入 SQLite
2. **列表渲染**：先显示 shimmer 占位，`scheduleDesignThumbnailLoads(items)` 逐批发 `design:getThumbnail` IPC（max 3 并发）
3. **后端返回**：`design:getThumbnail` handler 先查 SQLite 快路径，找不到才 on-demand 渲染 → 返回 `design:thumbnail { versionId, dataUrl }`
4. **renderer 收到后**：存入 `thumbnailCache`，原地替换 shimmer

图像版本不需要 on-demand 渲染（图片有 src），所以流程更简单：**renderer 生成缩略图 → 发 IPC 回存 → 下次直接用**。

---

## 修复详情

### Fix 1：`ImageLabResultItem` 加 `thumbnail` 字段

`src/imageGeneration/imageLabRuntime.ts`：

```typescript
export type ImageLabResultItem = {
  id: string;
  batchId: string;
  src: string;
  prompt: string;
  revisedPrompt?: string;
  createdAt: number;
  source: "generate" | "edit" | "variant";
  thumbnail?: string;   // ← 新增，base64 JPEG 小图（约 10-20KB）
};
```

---

### Fix 2：`ImageLabGalleryStore` 加 `saveThumbnail`

`src/imageGeneration/imageLabGalleryStore.ts`：

**2a. `normalizeResult` 透传 thumbnail**

```typescript
return {
  id: result.id,
  batchId: result.batchId,
  src: result.src,
  prompt: result.prompt,
  ...(typeof result.revisedPrompt === "string" ? { revisedPrompt: result.revisedPrompt } : {}),
  createdAt: result.createdAt,
  source,
  ...(typeof result.thumbnail === "string" && result.thumbnail ? { thumbnail: result.thumbnail } : {}),
};
```

**2b. 新增 `saveThumbnail` 方法**

```typescript
async saveThumbnail(id: string, dataUrl: string): Promise<void> {
  await this.enqueueWrite(async () => {
    const results = await this.loadResults();
    const idx = results.findIndex(r => r.id === id);
    if (idx === -1) return;
    results[idx] = { ...results[idx], thumbnail: dataUrl };
    await this.ensureStorageDir();
    await fs.writeFile(
      this.galleryPath,
      JSON.stringify({ updatedAt: Date.now(), results }, null, 2),
      "utf8",
    );
  });
}
```

---

### Fix 3：`ElectronChatPanel` 加 `image:saveThumbnail` handler

`electron/ElectronChatPanel.ts`，在 `image:loadState` 附近加：

```typescript
if (type === "image:saveThumbnail") {
  const id = typeof message.id === "string" ? message.id.trim() : "";
  const dataUrl = typeof message.dataUrl === "string" ? message.dataUrl.trim() : "";
  if (id && dataUrl.startsWith("data:image/")) {
    void this.imageGalleryStore.saveThumbnail(id, dataUrl).catch(() => {});
  }
  return;
}
```

注意：`this.imageGalleryStore` 的类型是 `ImageLabGalleryStore`，该方法新增后直接可调用。

---

### Fix 4：`electron/renderer/index.html` 四处改动

#### 4a. `image:state` handler 里预填 `thumbnailCache`

在 `case 'image:state':` 的 `applyImageLabState(msg)` 之后，加：

```javascript
if (Array.isArray(msg.resultBatches)) {
  for (const batch of msg.resultBatches) {
    for (const item of (batch.items || [])) {
      if (item?.id && item?.thumbnail && !thumbnailCache.has(item.id)) {
        thumbnailCache.set(item.id, item.thumbnail);
      }
    }
  }
}
```

#### 4b. `image:result` handler 里预填 `thumbnailCache`

在 `case 'image:result':` 的 `imageLabState.resultBatches = ...` 之后加同样的填充逻辑：

```javascript
if (Array.isArray(msg.resultBatches)) {
  for (const batch of msg.resultBatches) {
    for (const item of (batch.items || [])) {
      if (item?.id && item?.thumbnail && !thumbnailCache.has(item.id)) {
        thumbnailCache.set(item.id, item.thumbnail);
      }
    }
  }
}
```

#### 4c. `renderMidtaiImageWorks` 改用 `thumbnailCache`

当前（line ~3351）：
```javascript
<div class="midtai-img-card" ${imageDecodeCache.has(result.id) ? '' : `data-imgid="${result.id}"`}>
  <div class="midtai-img-thumb-wrap">${imageDecodeCache.has(result.id) && imageThumbCache.has(result.id) ? `<img ...>` : '<div class="thumb-shimmer"></div>'}</div>
```

**改为**：优先用 `thumbnailCache`（跟设计列表统一），其次用 `imageDecodeCache`：

```javascript
const cachedThumb = thumbnailCache.get(result.id) || (imageDecodeCache.has(result.id) ? imageThumbCache.get(result.id) : null);
```

渲染：
```javascript
<div class="midtai-img-card" ${cachedThumb ? '' : `data-imgid="${result.id}"`}>
  <div class="midtai-img-thumb-wrap">
    ${cachedThumb
      ? `<img loading="lazy" src="${cachedThumb}" class="midtai-img-thumb" alt="generated">`
      : '<div class="thumb-shimmer"></div>'}
  </div>
```

#### 4d. `observeMidtaiImageThumbs` 的 onload 回调里回存缩略图

当前 onload（已有 canvas 生成代码）改为：

```javascript
img.onload = () => {
  if (myToken !== midtaiThumbsToken) return;
  try {
    const SIZE = 320;
    const scale = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale) || SIZE;
    canvas.height = Math.round(img.naturalHeight * scale) || SIZE;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.65);
    imageThumbCache.set(id, thumbDataUrl);
    thumbnailCache.set(id, thumbDataUrl);          // ← 统一入 thumbnailCache
    send({ type: 'image:saveThumbnail', id, dataUrl: thumbDataUrl }); // ← 回存后端
  } catch (_) {}
  imageDecodeCache.add(id);
  wrap.innerHTML = '';
  wrap.appendChild(img);
};
```

---

## 实现顺序

1. `imageLabRuntime.ts`：加 `thumbnail?` 字段
2. `imageLabGalleryStore.ts`：`normalizeResult` 透传 + `saveThumbnail` 方法
3. `ElectronChatPanel.ts`：加 `image:saveThumbnail` handler
4. `electron/renderer/index.html`：4a → 4b → 4c → 4d

---

## 老数据兼容

- 旧 `gallery.json` 里没有 `thumbnail` 字段：`normalizeResult` 不报错，返回时 `thumbnail` 就是 `undefined`
- 用户第一次打开「我的作品」：仍走 shimmer → `observeMidtaiImageThumbs` 加载原图 → 生成缩略图 → 回存
- 之后每次：直接从 `thumbnailCache`（已由 `image:state` 预填）展示小图，不再加载原图

---

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

手动验证：
1. 生成几张图 → 进「我的作品」→ 确认图片正常展示（首次有 shimmer 短暂）
2. 关闭重开 App → 再进「我的作品」→ 缩略图应直接显示，无 shimmer，无卡顿
3. 切 生成预览 / 提示词库 / 我的作品，来回切换，应无明显延迟
4. `gallery.json` 里对应条目出现 `"thumbnail": "data:image/jpeg;base64,..."` 字段

---

## Already Completed

- [x] `src/imageGeneration/imageLabRuntime.ts` 为 `ImageLabResultItem` 增加 `thumbnail?: string`，允许结果 DTO 透传持久化缩略图。
- [x] `src/imageGeneration/imageLabGalleryStore.ts` 在 `normalizeResult` 中保留 `thumbnail`，并新增 `saveThumbnail(id, dataUrl)` 将 320px JPEG 小图回写到 `gallery.json`。
- [x] `electron/ElectronChatPanel.ts` 新增 `image:saveThumbnail` IPC handler，接收 renderer 回传的小图并异步持久化。
- [x] `electron/renderer/index.html` 在 `image:state` / `image:result` 收到结果批次时预填 `thumbnailCache`，首次打开时优先使用已有缩略图。
- [x] `electron/renderer/index.html` 的 My Works 列表优先渲染 `thumbnailCache`，缺失时才回落到原图 decode 路径。
- [x] `electron/renderer/index.html` 在首次原图加载后用 canvas 压缩为 320px JPEG，写回 `imageThumbCache` / `thumbnailCache`，并通过 `image:saveThumbnail` 回存后端。
- [x] 新增 `src/imageGeneration/imageLabGalleryStore.test.ts` 用例，覆盖 `saveThumbnail` 持久化与重新加载行为。
- [x] 已验证通过：`npm test`、`npm run check`、`npm run build`、`npm run build:electron`、renderer inline JS 语法检查、UTF-8 decode 检查。

## Next Step (the ONLY thing to do this session)

已完成，当前无需继续编码。下一步由 Claude PM 在 Electron App 中手测首开 shimmer / 重开热缓存命中，并验收 `gallery.json` 的 `thumbnail` 字段。

---

## Definition of Done

- [ ] `ImageLabResultItem` 有 `thumbnail?: string`
- [ ] `imageLabGalleryStore.saveThumbnail(id, dataUrl)` 存在且写入正确
- [ ] `image:saveThumbnail` IPC handler 存在
- [ ] `image:state` / `image:result` 收到时预填 `thumbnailCache`
- [ ] `renderMidtaiImageWorks` 优先用 `thumbnailCache`
- [ ] 首次加载原图后缩略图回存到 `gallery.json`
- [ ] `npm test` + `npm run check` + `npm run build` + `npm run build:electron` 全部通过
