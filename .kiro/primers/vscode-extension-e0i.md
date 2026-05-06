# Primer: vscode-extension-e0i

## 任务
Midtai 图像整合：左侧表单 + 生成预览 + 提示词库

## 规格文档
`.kiro/specs/midtai-image-integration.md` — 完整 spec，必读

## 改动范围
**仅** `electron/renderer/index.html`，不改其他文件

## 核心思路
复用不重建：
- 不新建独立图像状态，共享现有 `imageLabState`
- 不重写生成逻辑，`runMidtaiImage()` 同步参数后直接调 `runImageLab()`
- 新增 `renderMidtaiImagePreview()` 渲染到 `#view-img-preview`，与 `renderImageLabResults()`（渲染到 `#imglab-results`）并存

## Already Completed

- [x] `midtai-form-img` 已接入图像描述、比例、数量控件，`midtaiState` 新增 `imgSize` / `imgCount`
- [x] `runMidtaiImage()` 已接上 `runImageLab()`，通过同步 Image Lab 共享 DOM 复用现有生成链
- [x] `renderMidtaiImagePreview()` 已接入 `view-img-preview`，支持 shimmer 占位、结果卡片和 `replaceCtx` 分支按钮
- [x] `image:state` / `image:result` / `image:error` / `image:aborted` 已在 Midtai 图像模式下刷新预览
- [x] `view-plib` 已接入静态 `MIDTAI_PLIB_IMG` 提示词库，支持分类 chip 和 “使用” 回填 prompt
- [x] 用户手测通过：Midtai 图像 tab 可出现 shimmer、回图后替换为图片卡片，且“插入到对话”可用

## 关键现有函数（可直接复用）
- `runImageLab()` — 触发生成，读 `imglab-prompt` + `imglab-size-preset` + `imglab-batchcount`
- `buildImageLabPayload()` — 读 DOM 组装参数
- `renderImageLabResults()` — 参考这个写 renderMidtaiImagePreview()
- `imageLabState.resultBatches` — 结果数据源
- `imageLabState.busy` — 是否生成中

## 验收命令
```bash
npm run build:electron
```
然后手测：Midtai 图像 Tab → 输入描述 → 点生成 → 出现 shimmer → 出现图片

当前仓库基线说明：
- `npm run build:electron` 通过
- `npm run check` / `npm run build` 仍被非本任务的 hooks 相关 TS 错误阻塞：
  - `src/promptFlowHost.ts(786,27): error TS2554`
  - `src/promptTurnHost.ts(15,15): error TS2300`
  - `src/promptTurnHost.ts(18,15): error TS2300`
  - `src/promptTurnHost.ts(412,17): error TS2339`

## 注意
- Image Lab 原有功能必须不受影响
- replaceCtx 判断：`midtaiState.replaceCtx !== null` 时图片 hover 按钮变为「✓ 插入到设计」
