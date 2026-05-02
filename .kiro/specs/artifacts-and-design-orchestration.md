# KainClaw Artifacts + Design 编排系统 · 产品分析与技术缺口评审

**文件性质**：产品方向分析 + 技术缺口梳理，交 Codex 做可行性评审  
**作者**：Claude（PM 角色）  
**日期**：2026-05-01  
**状态**：草稿，待 Codex 技术评审

---

## 一、背景：我们在研究什么

本文档来源于以下问题：

> 当前图片生成路由（`chatPromptIntent.ts`）用正则判断意图，存在"用户说重写提示词但系统直接出图"的 bug。
> 在讨论修复路径时，发现问题根因不只是分类不准，而是整个产品架构对"多阶段设计编排"的支撑不足。

本文整合了：
- Anthropic 官方 Artifacts 产品资料（anthropic.com/news/artifacts，2024-08-27）
- Anthropic Claude Design 产品资料（anthropic.com/news/claude-design-anthropic-labs，2026-04-17）
- 多篇第三方评测（builder.io、macstories.net、appwrite.io）
- 与用户的产品方向讨论
- Claude 的产品分析结论

---

## 二、Anthropic 的两套机制（研究结论）

### 2.1 Artifacts 模式

**定义**：在对话流中，当 LLM 判断产出物值得独立呈现时，自动在右侧弹出专用窗口。

**触发逻辑**：
- 不靠关键词匹配，由模型内隐规则决定
- 经验规则：内容超过约 15 行 + 有独立性 + 有迭代价值
- 用户也可以显式说"作为 Artifact 输出"

**渲染位置**：右侧独立面板，左侧对话继续，两栏并排

**支持的产物类型**（官方列举）：

| 用户角色 | 用例 | 产物形态 |
|---|---|---|
| 开发者 | 从代码库生成架构图 | SVG / Mermaid |
| 产品经理 | 创建交互式原型 | HTML + CSS + JS |
| 设计师 | 构建可视化图表 | HTML + SVG + 图表库 |
| 营销人员 | 设计绩效仪表板 | HTML + CSS + JS |
| 销售团队 | 可视化销售管道 | HTML + SVG + JS |

**核心结论**：所有产物都是 LLM 生成的代码，在 iframe 里渲染，不是图片文件。

### 2.2 Claude Design 模式

**定义**：独立的设计工作台页面，有 Canvas 画布 + Tweaks 滑块面板 + inline 点击评论。

**核心特性**：
- 80% 的小改动不调用模型——拖动 slider，CSS 变量实时更新
- 可点击元素留 inline 评论，模型只改对应节点，不重写整页
- 导出 Canva / PDF / PPTX / HTML / Claude Code bundle

**与 Artifacts 的关系**：
- **完全独立**，两者互不相通
- 没有"Open in Claude Design"跳转按钮
- 用户必须手动切换，内容需要重新输入
- **这是 Claude 自身产品的一个空白**

---

## 三、用户期望的 KainClaw 产品流（具体对话示例）

用户给出了一个端到端的理想对话示例：

```
用户："你是一位平面设计师，会作图，有自己的设计思维，
       你接到一个任务准备给一个饮料产品做网站设计。"

KainClaw：调用 AskUserQuestion Tool，收集需求
用户：回答问题

KainClaw：输出【设计简报总结】（文字）

用户：上传了一段提示词 + "我觉得这个提示词不满意，你帮我优化一下"

KainClaw：输出优化后的提示词（文字）← 当前系统在此处会误判为图片生成

用户："帮我生成图片"

KainClaw：调用 GPT Image 2，生成网站设计图片

用户："帮我把这个设计图片做成可以点击的产品原型"

KainClaw：右侧弹出 Artifacts 窗口，展示 HTML+CSS+JS 交互式原型
          原型右上角出现【进入 Deep Design】按钮

用户：点击【进入 Deep Design】

KainClaw：进入 KainClaw Design 页面，带入当前 HTML，进行 slider 微调和二次创作
```

---

## 四、对话流的技术分解

每一轮对话实际上是不同的执行动作：

| 对话轮次 | 动作类型 | 执行器 | 当前状态 |
|---|---|---|---|
| 设置角色 | `chat` | LLM 文字 | ✅ 已有 |
| AskUserQuestion | `clarify_requirements` + Tool Use | Tool 执行 | ✅ 已有 |
| 输出设计简报 | `chat` | LLM 文字 | ✅ 已有 |
| 优化提示词 | `prompt_rewrite` | LLM 文字 | ❌ 路由器缺失，当前会误判为 `image_generate` |
| 生成图片 | `image_generate` | GPT Image 2 | ✅ 已有 |
| 图片→交互原型 | `derive_artifact` | 视觉模型 → HTML 生成 + Artifacts 面板 | ❌ 完全缺失 |
| Deep Design 入口 | UI 桥接 | kainclaw-design.md Design Lab | ❌ 标注为 V2，需提前 |

---

## 五、发现的三个技术缺口

### 缺口 1：`prompt_rewrite` 意图缺失（高优先级）

**问题**：用户说"帮我优化这个提示词"，即使消息里充满"海报"、"设计"等词，当前正则路由仍会判为 `image_generate`，直接出图。

**根因**：`chatPromptIntent.ts` 只有三类：`chat / image_generate / image_edit`，没有"元任务优先于执行任务"的概念。

**已有讨论**：`img-intent-llm-router.md`（v2）已讨论用 LLM 做路由，但 `prompt_rewrite` 还未加入 intent 列表。

**需要做的**：在 `img-intent-llm-router.md` 的 system prompt 里增加第四个意图：
```
prompt_rewrite（优化/重写提示词或设计 brief）
  适用：用户说"优化提示词"、"重写 brief"、"改写一下"
  强规则：即使消息里充满图片相关词汇，只要动作是"写/改/优化文字"，就选这个
  不出图，输出文字
```

### 缺口 2：Artifacts 渲染面板（高优先级）

**问题**：整个产品没有右侧 Artifacts 面板的概念。当前图片生成结果显示在对话流里，HTML 产物更没有专门的预览窗口。

**需要做的**：
- 新建 Artifacts 渲染组件（iframe sandbox）
- 触发时机：当 LLM 产出 HTML / SVG / 可渲染代码时，自动在右侧展示
- 支持基础交互：可点击、可滚动、实时预览
- 触发判断：基于产物类型，不走 LLM（HTML → 显示；Markdown/代码 → 不显示）

### 缺口 3：`derive_artifact` 执行链（高优先级）

**问题**："帮我把这张图做成可以点击的原型"——这是一个全新的动作，当前没有任何支撑。

**技术链路**：
```
用户说"做成原型"
  ↓
路由器识别 → derive_artifact
  ↓
从对话上下文获取最近生成的图片（active_object = generated_image）
  ↓
把图片传给视觉理解模型 + 提示词："根据这张图生成对应的 HTML+CSS+JS 交互原型"
  ↓
LLM 生成 HTML 代码
  ↓
渲染到 Artifacts 面板（iframe）
  ↓
右上角显示【进入 Deep Design】按钮
```

这个动作依赖：
- Artifacts 面板存在（缺口 2）
- 视觉模型能处理图片输入（现有 provider 已支持）
- 路由器增加 `derive_artifact` 意图

### 缺口 4：Deep Design 入口桥接（中优先级）

**问题**：`kainclaw-design.md` 的 Design Lab 和 Artifacts 之间没有桥接。用户点击【进入 Deep Design】后没有着陆页面，也没有内容传递机制。

**现状**：`kainclaw-design.md` Section 15.3 预留了 V2 反向联动接口，但当前 V1 没有"Artifacts → Design Lab"的正向跳转。

**需要做的**：
- 在 Artifacts 面板右上角加【进入 Deep Design】按钮（仅 HTML 类 Artifact 显示）
- 点击时：把当前 HTML 字符串传给 Design Lab，打开 `page-design` 页面
- Design Lab 用传入的 HTML 作为初始版本，进入 slider 微调流程
- 这应该从 V2 提升到 V1 一并实现

---

## 六、产物类型与 Deep Edit 按钮的显示规则

不需要 LLM 判断，用产物类型直接决定：

| 产物类型 | 显示 Deep Edit？ | 原因 |
|---|---|---|
| HTML（原型、仪表板、营销页） | ✅ 是 | slider 调参价值高 |
| SVG + 可视化图表 | ⚠️ 可选 | 颜色/大小有价值，结构不适合 |
| Mermaid / 架构图 | ❌ 否 | 结构为主，样式不重要 |
| 代码（TS/Python 等） | ❌ 否 | 应进代码编辑器 |
| Markdown / 文本 | ❌ 否 | 直接文字编辑 |

---

## 七、与现有 spec 的关系

| 现有文档 | 关系 |
|---|---|
| `img-intent-llm-router.md`（v2） | 需要补充 `prompt_rewrite` 和 `derive_artifact` 两个意图 |
| `kainclaw-design.md` | Design Lab 核心逻辑复用，入口从独立面板改为 Artifacts 桥接，Deep Design 桥接从 V2 提至 V1 |
| `v1-product-spec.md` | 需要检查 Artifacts 面板是否在 V1 范围内 |

---

## 八、请 Codex 评审的问题

1. **`derive_artifact` 的视觉模型调用**：把生成的图片传给 LLM 生成 HTML 原型，当前 provider 层（`IProviderAdapter`）是否支持？image attachment 传入 `runStep` 的能力是否已经具备（参考 `imagePromptInference.ts` 的 vision 调用路径）？

2. **Artifacts 面板的渲染方案**：在 Electron 环境下，iframe sandbox 的安全隔离方案是否可行？需要哪些 IPC 扩展？当前 `ElectronChatPanel.ts` 的消息渲染架构能否支持插入一个右侧面板？

3. **`prompt_rewrite` 意图**：直接加进 `img-intent-llm-router.md` v2 的 system prompt 即可，还是需要额外的处理分支？当前 `runChatImageJob` / `sendPrompt` 分支结构能否直接容纳第四条路径？

4. **整体实现顺序建议**：从你的视角看，缺口 1/2/3/4 的推荐实现顺序是什么？有没有依赖关系需要先解决？

5. **范围风险**：这次引入 Artifacts 面板 + derive_artifact + Deep Design 桥接，估算涉及文件数量是否超过 AGENTS.md 的 8 文件警戒线？如果超出，建议如何拆分成多个独立 PR？
