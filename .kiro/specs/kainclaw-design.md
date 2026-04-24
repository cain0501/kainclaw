# KainClaw Design · 实现规格书

**版本**：v1.0  
**日期**：2026-04-23  
**状态**：待实现（前提：Electron 主进程已立起，Phase E 完成后开始）  
**负责人**：Codex（实现）/ Claude（PM）  
**对应 Gap Analysis**：P4-08

---

## 一、产品目标

对标 Anthropic Claude Design（2026-04-17 发布），但：
- **支持任意已配置 Provider**（Claude Design 只能用 Claude Opus）
- **本地优先，数据不出设备**（Claude Design 云端处理）
- **内置在 KainClaw Windows 客户端**，无需单独安装

**一句话体验**：
在 KainClaw 里输入一句需求，秒出高保真原型 / 幻灯片 / 信息图 / 动画，拖动 sliders 微调参数，点击元素留评论局部改写，一键导出 HTML / PPTX / PDF。

---

## 二、参考来源与取用策略

| 参考源 | 许可 | 取用内容 | 不取用 |
|--------|------|----------|--------|
| [open-codesign](https://github.com/OpenCoworkAI/open-codesign) | MIT | sliders JSON schema、inline patch CSS selector 结构、SQLite 版本快照机制、live agent 进度 UX 模式 | 整体 Electron App 架构（与 KainClaw 不兼容） |
| [huashu-design](https://github.com/alchaincyf/huashu-design) | 个人免费 | SKILL.md 设计哲学、反 AI slop 规则、Junior Designer 工作流、24 showcase 风格参考、品牌资产协议 | 直接 fork（许可限制商业用途） |

**原则**：不 fork，不复制，参考机制自行实现。

---

## 三、架构总览

```
KainClaw Windows 主进程
├── 现有模块（IProviderAdapter / SettingsRepository / LicenseManager）
└── packages/design/                    ← 新增，本规格书覆盖范围
    ├── designEngine.ts                 ← prompt 组装 + AI 调用 + HTML 解析
    ├── slidersExtractor.ts             ← 解析模型输出的 sliders JSON
    ├── patchEngine.ts                  ← inline 评论 → 局部 patch
    ├── exporters.ts                    ← HTML / PPTX / PDF 导出
    ├── versionStore.ts                 ← SQLite 版本快照
    ├── designPrompt.ts                 ← 系统提示词（设计大脑）
    └── showcaseIndex.ts                ← 内置风格参考资产索引

Electron renderer / Design Panel
├── DesignWorkbench.html               ← 设计工作台 UI（新增页面）
└── 与主进程 IPC：design:generate / design:patch / design:export / design:versions
```

---

## 四、核心交互流程

```
用户输入 prompt
    ↓
[可选] 设计方向顾问：需求模糊时展示 3 个风格方向 + showcase 截图让用户选
    ↓
designEngine 组装 prompt（系统提示词 + 用户需求 + 上下文）
    ↓
AI 生成：HTML 原型 + sliders JSON（同一次调用，结构化输出）
    ↓
renderer：sandboxed iframe 预览 HTML
         右侧面板渲染 AI 生成的 sliders（颜色/间距/字体）
    ↓
用户拖动 slider → CSS 变量实时更新 iframe（纯前端，不重新调用 AI）
    ↓
用户点击元素 → 留 inline 评论 → patchEngine 局部改写该节点（不重写整页）
    ↓
每次 AI 响应后 → versionStore 快照当前 HTML（本地 SQLite）
    ↓
导出：HTML（直接） / PPTX（pptxgenjs）/ PDF（Puppeteer）
```

---

## 五、设计大脑（designPrompt.ts）

这是影响输出质量最核心的部分，综合 huashu-design SKILL.md 机制。

### 5.1 角色定义

```
你是一位用 HTML 工作的设计师，不是程序员。
HTML 是工具，媒介随任务类型切换：做幻灯片时不要像网页，做 App 原型时不要像说明书。
根据任务 embody 对应专家：UX 设计师 / 幻灯片设计师 / 动画师 / 信息图设计师。
```

### 5.2 反 AI 通病规则（硬规则，不可违反）

```
禁止：
- #3B82F6 / #6366F1 紫蓝色系按钮（AI 审美最大公约数）
- emoji 作为图标替代品
- 大圆角 + 左侧 border-accent 卡片（烂大街组合）
- SVG 手绘人脸/插画（AI slop 标志）
- Inter + 紫渐变（99% AI 生成页面的配置）
- 对称双栏 + 居中标题 + CTA 按钮的通用 landing page 结构

要求：
- 留白比例至少 40%（高端感来自克制，不是堆砌）
- 字重对比（Display 用 200-300，Body 用 400-500，强调用 700+）
- 颜色用 oklch() 色彩空间（比 hex 更有设计感的色调）
- text-wrap: pretty（排印细节）
- CSS Grid 精准分栏（不要一栏到底）
- 选择有个性的 serif display 字体，不要全站 sans-serif
```

### 5.3 五大设计流派（需求模糊时的方向选择库）

参考 huashu-design 的 20 种哲学，精简为 KainClaw 的 5 大流派：

| 流派 | 核心气质 | 标志特征 |
|------|---------|---------|
| **信息建筑**（Pentagram 风） | 高对比 + 瑞士网格 + 强排版层级 | Black/White + #E63946 红色点缀 |
| **极简奢侈**（Build Studio 风） | 大量留白 + 极细字重 + 暖金点缀 | 70%+ 留白，字重 200-300，#D4A574 |
| **东方极简**（Takram 风） | 软科技 + 自然色调 + 有机圆角 | Beige/Grey，艺术感数据可视化 |
| **实验先锋**（Sagmeister 风） | 打破网格 + 意外性构图 + 强烈个性 | 非对称，质感纸张/噪点 |
| **运动诗学**（Field.io 风） | 流体动画 + 数据驱动 + 生成艺术感 | 动态、时间轴驱动、数学美感 |

### 5.4 输出格式要求（结构化，便于前端解析）

模型每次生成必须输出两段：

**段一：HTML**
```html
<!-- KAINCLAW_DESIGN_HTML_START -->
<!DOCTYPE html>
<html>
...完整 HTML...
</html>
<!-- KAINCLAW_DESIGN_HTML_END -->
```

**段二：sliders JSON**
```json
<!-- KAINCLAW_DESIGN_SLIDERS_START -->
{
  "sliders": [
    {
      "id": "primary-color",
      "label": "主色调",
      "type": "color",
      "cssVar": "--color-primary",
      "default": "#1a1a2e"
    },
    {
      "id": "body-spacing",
      "label": "内容间距",
      "type": "range",
      "cssVar": "--spacing-base",
      "default": 16,
      "min": 8,
      "max": 32,
      "unit": "px"
    },
    {
      "id": "font-weight-display",
      "label": "标题字重",
      "type": "select",
      "cssVar": "--fw-display",
      "default": "300",
      "options": ["200", "300", "400", "600", "700"]
    }
  ]
}
<!-- KAINCLAW_DESIGN_SLIDERS_END -->
```

**约束**：
- sliders 只暴露 3-7 个最有视觉影响力的参数（不要超过 7 个，避免参数焦虑）
- 所有 slider 的 cssVar 必须在 HTML 的 `:root` 里声明
- color 类型只提供主色 / 辅色 / 文字色，不要暴露所有颜色

### 5.5 Junior Designer 工作流

模仿 huashu-design 的迭代范式：

1. **开工前**：先列 assumptions + placeholders，发给用户确认，等批量回复
2. **第一版**：用真实内容替换 placeholder，优先展示骨架结构
3. **迭代**：收到用户 inline 评论后，只改对应节点，不重写整页
4. **交付前**：自检反 AI 通病清单，确认颜色 / 字重 / 留白达标

### 5.6 内置 showcase 参考库

在 `assets/design-showcases/` 目录存放 PNG 截图，按场景 × 风格命名：

```
design-showcases/
├── INDEX.md                    # 索引，agent 查找用
├── landing/
│   ├── landing-minimal.png
│   ├── landing-bold.png
│   └── landing-eastern.png
├── slide/
│   ├── slide-data.png
│   └── slide-pitch.png
├── app-proto/
│   ├── app-ios-minimal.png
│   └── app-dashboard.png
├── infographic/
│   └── info-magazine.png
└── cover/
    ├── cover-minimal.png
    └── cover-bold.png
```

需求模糊时，在 UI 里展示 3 张匹配的 showcase PNG，让用户先选风格方向。

---

## 六、sliders 机制（slidersExtractor.ts）

**数据流**：
```
AI 输出原始文本
    → slidersExtractor.parse(rawOutput)
    → 提取 HTML 和 sliders JSON
    → 校验 cssVar 是否都在 HTML :root 里定义
    → 返回 { html: string, sliders: SliderDef[] }
```

**前端拖动时**：
```
用户拖动 slider（纯前端，不调 AI）
    → 更新 iframe contentWindow.document.documentElement.style.setProperty(cssVar, newVal)
    → 实时预览，无需重新生成
```

**类型定义**：
```typescript
type SliderDef =
  | { id: string; label: string; type: 'color'; cssVar: string; default: string }
  | { id: string; label: string; type: 'range'; cssVar: string; default: number; min: number; max: number; unit: string }
  | { id: string; label: string; type: 'select'; cssVar: string; default: string; options: string[] }
```

---

## 七、inline patch 机制（patchEngine.ts）

参考 open-codesign 的 CSS selector 路径提取方案。

**前端操作流**：
```
用户点击 iframe 内任意元素
    → 前端提取该元素的 CSS selector（稳定路径，不依赖 nth-child 随机数）
    → 弹出评论输入框
    → 用户写评论 → 点击"应用"
    → 发送 design:patch IPC
```

**patch prompt 结构**：
```
当前完整 HTML：<html>...</html>

目标元素 selector：.hero-section > h1

用户评论：把这个标题改成渐变文字，颜色从深棕到橙色

任务：
- 只返回该 selector 对应元素的替换内容（单个 HTML 节点）
- 不要重写整页
- 保持已有 CSS 变量引用不变
- 返回格式：
<!-- PATCH_NODE_START -->
<h1 class="...">...</h1>
<!-- PATCH_NODE_END -->
```

**主进程处理**：
```typescript
// patchEngine.ts
async function applyPatch(html: string, selector: string, patchNode: string): Promise<string> {
  // 用 cheerio 找到 selector 对应节点，替换为 patchNode
  // 返回完整更新后的 HTML
}
```

---

## 八、版本快照（versionStore.ts）

参考 open-codesign 的 SQLite 快照机制。

**存储路径**：`{storageDir}/design-lab/versions.db`

**数据结构**：
```sql
CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  prompt TEXT,
  html TEXT NOT NULL,
  sliders_json TEXT,
  thumbnail_base64 TEXT,  -- iframe 截图，64x40 缩略图
  source TEXT             -- 'generate' | 'patch' | 'slider'
);
```

**使用规则**：
- 每次 AI 生成（generate / patch）后自动保存快照
- 拖 slider 不保存快照（纯前端操作，可用 slider 默认值回退）
- UI 展示最近 20 个版本缩略图，点击即时切换

---

## 九、导出（exporters.ts）

### 9.1 HTML 导出
直接把当前 HTML 字符串写文件，附带当前 slider 值内联到 `:root`。

### 9.2 PDF 导出
```typescript
import { BrowserWindow } from 'electron'

async function exportPDF(html: string, outputPath: string) {
  const win = new BrowserWindow({ show: false })
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  const pdf = await win.webContents.printToPDF({ printBackground: true })
  fs.writeFileSync(outputPath, pdf)
  win.destroy()
}
```

### 9.3 PPTX 导出
使用 `pptxgenjs`（MIT 协议）。

策略：
- 1920×1080 slide 类型 → 读 HTML 中的 `.slide` 节点逐页截图 → 图片铺满 slide
- 如果 HTML 有明确 `.slide-text` 语义标签 → 尝试提取为真实文本框（保留可编辑性）
- 兜底：全页截图作为图片 slide（保证至少能导出）

```typescript
import pptxgen from 'pptxgenjs'

async function exportPPTX(html: string, outputPath: string) {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE' // 16:9
  // ... 截图 + 添加 slide 逻辑
  await pptx.writeFile({ fileName: outputPath })
}
```

---

## 十、UI 规格（Design Panel）

### 10.1 页面结构

```
page-design（新增，与 page-chat / page-images 平级）
├── 左侧面板（320px）
│   ├── prompt 输入框（多行，支持 @brand 引用品牌资产）
│   ├── [生成] 按钮 + provider 选择（复用现有 provider 状态）
│   ├── 输出类型选择：原型 / 幻灯片 / 信息图 / 动画
│   ├── ── sliders 区域 ──
│   │   └── AI 生成的 3-7 个 sliders（color picker / range / select）
│   ├── ── 版本历史 ──
│   │   └── 最近 10 版缩略图横向滚动，点击切换
│   └── ── 导出 ──
│       └── [HTML] [PDF] [PPTX] 三个按钮
│
└── 右侧预览区（flex:1）
    ├── 顶部工具栏：设备模拟切换（Desktop / Tablet / Mobile）
    ├── sandboxed iframe（sandbox="allow-scripts allow-same-origin"）
    └── 底部：inline 评论提示文案 + live agent 进度条
```

### 10.2 设计方向顾问（Fallback UI）

当 prompt 过于模糊（< 10 字，或不含具体场景词）时：

```
┌─────────────────────────────────────┐
│  你想做什么风格？选一个方向开始：          │
│                                     │
│  [showcase-a.png]  [showcase-b.png]  [showcase-c.png]
│  信息建筑风格      极简奢侈风格       东方极简风格
│                                     │
│  [直接描述，跳过风格选择]               │
└─────────────────────────────────────┘
```

### 10.3 live agent 进度

参考 open-codesign 的可见 agent 活动 UI：

```
● 正在分析需求...
● 选择设计流派：极简奢侈
● 生成 HTML 结构...
● 提取 sliders 参数...
✓ 完成（3.2s）
```

进度显示在预览区底部 toast 条，生成结束后 2s 自动消失。

### 10.4 inline 评论 UI

点击 iframe 内元素时：
- 被点击元素出现蓝色虚线高亮
- 右下角弹出评论气泡（类似 Notion comment）
- 输入文字后点击"应用"或按 ⌘+Enter
- 应用过程显示 loading 状态，完成后高亮消失

---

## 十一、IPC 协议

主进程监听，renderer 发送：

```typescript
// renderer → main
design:generate   { prompt: string; outputType: 'prototype'|'slide'|'infographic'|'animation'; style?: string }
design:patch      { html: string; selector: string; comment: string }
design:slider     { cssVar: string; value: string }   // 纯前端处理，不需要 IPC
design:export     { format: 'html'|'pdf'|'pptx'; html: string; sliders: SliderDef[] }
design:loadVersions  { projectId: string }
design:restoreVersion { versionId: string }

// main → renderer
design:progress   { step: string; done: boolean }
design:result     { html: string; sliders: SliderDef[]; versionId: string }
design:patchResult { html: string; versionId: string }
design:versions   { versions: VersionMeta[] }
design:exportDone { filePath: string }
design:error      { message: string }
```

---

## 十二、文件结构

```
vscode-extension/
└── packages/
    └── design/
        ├── package.json
        ├── tsconfig.json
        ├── designEngine.ts
        ├── slidersExtractor.ts
        ├── patchEngine.ts
        ├── exporters.ts
        ├── versionStore.ts
        ├── designPrompt.ts          ← 设计大脑系统提示词
        └── showcaseIndex.ts         ← 内置 showcase 索引

vscode-extension/
└── assets/
    └── design-showcases/
        ├── INDEX.md
        ├── landing/
        ├── slide/
        ├── app-proto/
        └── cover/

electron/
└── renderer/
    └── index.html                   ← 新增 page-design 页面与相关 JS/CSS
```

---

## 十三、依赖清单

| 包 | 用途 | 许可 |
|----|------|------|
| `better-sqlite3` | 版本快照存储 | MIT |
| `pptxgenjs` | PPTX 导出 | MIT |
| `cheerio` | HTML DOM 操作（patch engine） | MIT |
| `electron` | PDF 导出用 webContents.printToPDF | MIT |

不引入新的 AI SDK，复用现有 `IProviderAdapter`。

---

## 十四、实现前提与开发顺序

**前提**：Electron 主进程 Phase E 完成（当前已完成）。

**建议开发顺序**：

1. `designPrompt.ts` — 先把设计大脑写好，这是质量基础
2. `slidersExtractor.ts` — 解析器，单元测试友好
3. `designEngine.ts` — 核心 AI 调用，先用简单输出类型测试
4. UI：page-design 骨架 + iframe 预览 + sliders 渲染
5. `patchEngine.ts` — inline 评论改写
6. `versionStore.ts` — 版本快照
7. `exporters.ts` — 最后做，依赖前面稳定后再接

**验收标准**：
- [ ] 一句 prompt 能出 HTML 预览
- [ ] sliders 拖动实时更新 iframe，不重新调用 AI
- [ ] 点击元素留评论，只改对应节点，不重写整页
- [ ] 版本历史可切换
- [ ] 导出 HTML / PDF 可用
- [ ] 反 AI slop 清单：输出颜色不是紫蓝渐变，有留白，字重有对比

---

## 十五、与 Image Lab 的关系

### 15.1 定位区分（无冲突）

| | Image Lab | KainClaw Design |
|---|---|---|
| AI 调用类型 | 图像生成 API（gpt-image-2 等） | 对话 API（任意 LLM） |
| 输出物 | 栅格图片（PNG / JPG） | HTML / PPTX / PDF |
| 用途 | 生成独立图片：产品图、插画、海报 | 生成可交互原型、幻灯片、信息图 |
| 存储 | `image-lab/gallery.json` | `design-lab/versions.db` |
| Provider 类型 | 图像模型（单独配置） | 聊天模型（已有配置） |

两者技术链路完全独立，UI 上是两个平级 Panel（`page-images` vs `page-design`），不互相干扰。

### 15.2 用户选择引导

用户可能在"想做一张设计感强的海报"时不知道该进哪个入口。UI 层面需要用一句话区分：
- **Image Lab** 入口副标题：`AI 生成图片 · 产品图 / 插画 / 海报`
- **Design** 入口副标题：`HTML 原型 · 幻灯片 / 信息图 / 交互 Demo`

本质区别：Image Lab 输出的是**像素图片**（AI 画的），Design 输出的是**代码构成的设计**（可交互、可改、可导出矢量）。

### 15.3 Image Lab → Design 联动（V2 规划，V1 预留接口）

**场景**：用户在 Image Lab 生成了产品图，想在 Design 原型里用这张图作为 hero 图片。

**V2 交互设想**：
```
Design 工作台左侧面板
└── 参考图区域（类似 Image Lab 的参考图上传）
    ├── [从本地上传]
    └── [从 Image Lab 画廊选取]  ← V2 新增
            ↓
    弹出 Image Lab 历史画廊选择器
    用户点选一张图 → 图片 dataURL 注入到 Design HTML 的 img[src]
```

**V1 需要预留的接口**（在 `designEngine.ts` 里留好参数，V2 填充逻辑）：
```typescript
interface DesignGenerateOptions {
  prompt: string
  outputType: 'prototype' | 'slide' | 'infographic' | 'animation'
  style?: string
  referenceImageDataUrl?: string  // V1 支持本地上传；V2 接 Image Lab 画廊
}
```

**反向联动（V2 选做）**：Design 里的 HTML 含有 `<img>` 占位时，用户可右键选择"用 Image Lab 生成这张图"，自动带入当前 img 的 alt 文字作为 Image Lab prompt。

---

## 十六、明确不做（V1 范围外）

- MP4 / GIF 动画导出（open-codesign / huashu-design 都有，但需要 Puppeteer + ffmpeg，依赖链重，V2 再做）
- Figma 导入 / 导出
- 多人协作
- 自定义 SKILL.md 覆盖（用户级系统提示词，V2 功能）
- 品牌资产自动爬取协议（huashu-design 的 5 步流程，V2 再加，V1 用户手动粘贴品牌色）
- Image Lab 画廊选取（预留接口，V2 实现）
- Design → Image Lab 反向联动（V2 选做）
