# Primer: vscode-extension-73d
# midtai-p1a：图像 tab 右侧三段式重排

## 阶段标记

Phase 1 / renderer-first / 不改图像底层数据模型

---

## 背景

当前 Midtai 图像 tab 右侧把"生成中的批次"、"本轮最新结果"、"历史图片"混排在一起，
用户无法快速定位当前批次状态，历史图片也干扰了当前操作决策。

产品决议（`midtai-unified-workbench-decision.md`）已拍板：
图像 tab 右侧主区应分成三个独立区段，从上到下依次排列。

---

## 目标行为

```
右侧主区（从上到下）：
  ┌─────────────────────────────┐
  │  当前批次生成中（skeleton）  │  ← 生成时出现，完成后消失
  ├─────────────────────────────┤
  │  本轮最新结果               │  ← 最近一批生成结果，固定置顶
  ├─────────────────────────────┤
  │  历史图片网格               │  ← 长期积累，不和当前批次混排
  └─────────────────────────────┘
```

---

## 现有代码关键位置

### electron/renderer/index.html

图像 tab 相关渲染函数（搜索这些关键词定位）：
- `renderMidtaiImagePreview()`：当前图像预览渲染入口
- `renderMidtaiImageWorks()`：图像作品/历史列表渲染
- `renderMidtaiImageTab()` 或类似的图像 tab 总渲染函数

当前右侧很可能是一个统一的列表/网格，需要拆分成三个独立区段。

### electron/ElectronChatPanel.ts

图像生成相关：
- `runImageJob()`：图像生成主函数，生成中会通过某种方式通知 renderer
- `runImageVariant()`：图像变体
- 搜索 `midtai:image` 或 `image:result` 等相关 IPC 消息类型，了解 host → renderer 的图像结果推送格式

---

## 实现要点

### 1. 区分三种状态的数据来源

| 区段 | 数据来源 | 渲染方式 |
|------|---------|---------|
| 当前批次生成中 | host 推送的 in-progress 状态 | skeleton card |
| 本轮最新结果 | 最近一次生成完成的 batch | 正常图片卡片，置顶 |
| 历史图片网格 | `imageGalleryStore` 历史记录 | 小图网格，分页或滚动 |

### 2. 生成中区段的显隐逻辑

- 有进行中的批次 → 显示 skeleton 区段（带 prompt 摘要和进度提示）
- 批次完成后 → skeleton 区段消失，结果移入"本轮最新结果"
- 没有进行中 → 区段完全不渲染，不占空间

### 3. 本轮最新结果的定义

- "本轮"= 最近完成的那一批，不是全部历史
- 可以用 `imageGalleryStore` 的最新 batch 数据来源
- 每张图片卡片需要有两个主动作：
  - **插入当前设计**（`insertToDesign(imageUrl)`，已有实现）
  - **做变体** / **继续编辑**

### 4. 历史图片网格

- 排除"本轮最新结果"那一批，显示更早的历史
- 采用密集小图网格（不需要大卡片）
- 有"查看全部素材"入口（Phase 2 作品库，Phase 1 可以先 link 到占位页）

---

## 验收标准

1. 点图像生成后，右侧顶部出现 skeleton 批次区，包含当前 prompt 摘要
2. 生成完成后 skeleton 区消失，结果出现在"本轮最新结果"区
3. 历史图片单独在下方网格，不和当前批次混排
4. 无进行中批次时，skeleton 区不占位
5. 图像 tab 左侧（工具区 / prompt / 参数）不受影响

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 中 | 图像 tab 渲染逻辑改动 |
| `electron/ElectronChatPanel.ts` | 低 | 如需补 payload 字段（如 batchId）才动 |

---

## 明确不做

- 不改 `imageGalleryStore` 的数据结构
- 不改图像生成的底层流程（`runImageJob` 等）
- 不做图片收藏 / 素材库写入（Phase 2）
- 不做"当前目标：作品 A"上下文芯片（Phase 2）
