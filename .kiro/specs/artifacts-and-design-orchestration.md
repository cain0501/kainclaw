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
- UI 入口独立，没有"Open in Claude Design"跳转按钮，用户必须手动切换
- 但两者通过 postMessage 实现 iframe↔宿主的状态同步（见 §5 缺口 2 协议规格）
- 这套协议已被逆向还原（来源：`make-tweakable.md`，Trystan-SA/claude-design-system-prompt）
- **KainClaw 的缺失在于 UI 跳转入口和 HTML 内容传递机制，不是协议本身**

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
          原型右上角出现【进入 KainClaw Design】按钮

用户：点击【进入 KainClaw Design】

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
| 优化提示词 | `prompt_rewrite` | LLM 文字 | ✅ 已实现 |
| 生成图片 | `image_generate` | GPT Image 2 | ✅ 已有 |
| 图片→交互原型 | `derive_artifact` | 视觉模型 → HTML 生成 + Artifacts 面板 | ✅ 已实现 |
| KainClaw Design 入口 | UI 桥接 | kainclaw-design.md Design Lab | ❌ 提升至 V1，与 Artifacts 面板同批实现 |

---

## 五、发现的三个技术缺口

### ~~缺口 1~~（已实现）：`prompt_rewrite` 意图

**状态**：✅ 已实现。`prompt_rewrite` 意图已加入路由器，`chatPromptIntent.ts` 和 `llmIntentRouter.ts` 均已支持，强规则"元任务优先于执行任务"已生效。

### ~~缺口 2~~（已实现）：Artifacts 渲染面板

**状态**：✅ 已实现（yd5.3）。右侧 Artifacts 面板已存在，iframe sandbox 渲染、产物类型触发判断均已实现。

**yd5.5 背景说明（KainClaw Design bridge 所需上下文）**：

DOM 层已知问题：`index.html` 中 `<aside #artifacts-panel>` 嵌套在 `.chat-column`（`overflow:hidden`）内，面板被裁切不可见。修复方式：把 `.chat-column` 的 `</div>` 移到 `<aside>` 标签之前，使两者成为 `.chat-workspace` 的平级 flex 子节点。

**Tweak 面板 postMessage 协议规格**（来源：逆向还原 Claude Design，Trystan-SA/claude-design-system-prompt）：

```
// iframe → 宿主：注册监听后立即发送，宿主收到后在 toolbar 显示 Tweaks 按钮
window.parent.postMessage({type: '__edit_mode_available'}, '*')

// 宿主 → iframe：用户点击 Tweaks 按钮时发送
{type: '__activate_edit_mode'}

// 宿主 → iframe：用户关闭 Tweaks 时发送
{type: '__deactivate_edit_mode'}

// iframe → 宿主：用户修改某个 tweak 时发送，宿主将 edits 写回 HTML 文件
{type: '__edit_mode_set_keys', edits: {primaryColor: '#FF6600', fontSize: 16}}
```

**注意顺序**：必须先注册 `message` 监听器，再发送 `__edit_mode_available`，否则宿主的 activate 消息在监听器存在前就到达，toggle 静默失效。

**CSS 变量模式（slider 驱动 live 更新，无需重新生成）**：

```css
:root {
  --tweak-primary: #0066CC;
  --tweak-font: "Inter", sans-serif;
  --tweak-density: 16px;
}
```
```js
// slider onChange
document.documentElement.style.setProperty('--tweak-primary', newColor);
```

**持久化模式（改动跨刷新保留）**：

```js
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryColor": "#D97757",
  "dark": false
}/*EDITMODE-END*/;
```
宿主匹配 `/*EDITMODE-BEGIN*/.../*EDITMODE-END*/` 范围，将 edits 合并后写回 HTML 文件，必须是合法 JSON（双引号键名）。

**控件数量建议**：3–8 个控件为合理范围。关闭 Tweaks 后设计必须完全看不到面板（no tweak chrome visible）。

### ~~缺口 3~~（已实现）：`derive_artifact` 执行链

**状态**：✅ 已实现。路由器已识别 `derive_artifact` 意图，图片→HTML 原型的执行链已打通，视觉模型 image attachment 调用已确认可用。

### 缺口 4：KainClaw Design 入口桥接（中优先级）

**问题**：`kainclaw-design.md` 的 Design Lab 和 Artifacts 之间没有桥接。用户点击【进入 KainClaw Design】后没有着陆页面，也没有内容传递机制。

**现状**：`kainclaw-design.md` Section 15.3 预留了 V2 反向联动接口，但当前 V1 没有"Artifacts → Design Lab"的正向跳转。

**需要做的**：
- 在 Artifacts 面板右上角加【进入 KainClaw Design】按钮（仅 HTML 类 Artifact 显示）
- 点击时：把当前 HTML 字符串传给 Design Lab，打开 `page-design` 页面
- Design Lab 用传入的 HTML 作为初始版本，进入 slider 微调流程
- 这应该从 V2 提升到 V1 一并实现

---

## 六、产物类型与 Deep Edit 按钮的显示规则

不需要 LLM 判断，用产物类型直接决定：

| 产物类型 | 显示【进入 KainClaw Design】？ | 原因 |
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
| `kainclaw-design.md` | Design Lab 核心逻辑复用，入口从独立面板改为 Artifacts 桥接，KainClaw Design 桥接已提升至 V1 |
| `v1-product-spec.md` | 需要确认 Artifacts 面板渲染和 KainClaw Design 桥接是否已纳入 V1 范围 |

---

## 八、请 Codex 评审的问题

1. **Artifacts 面板的渲染方案**：在 Electron 环境下，iframe sandbox 的安全隔离方案是否可行？需要哪些 IPC 扩展？当前 `ElectronChatPanel.ts` 的消息渲染架构能否支持插入一个右侧面板？

2. **整体实现顺序建议**：缺口 2（Artifacts 面板）和缺口 4（KainClaw Design 桥接）有依赖关系，建议实现顺序是什么？

3. **范围风险**：Artifacts 面板 + KainClaw Design 桥接，估算涉及文件数量是否超过 AGENTS.md 的 8 文件警戒线？如果超出，建议如何拆分成多个独立 PR？

---

## 九、已完成项同步

| 编号 | 内容 | 状态 |
|---|---|---|
| yd5.1 | intent router（LLM 意图路由） | ✅ 已完成 |
| yd5.2 | artifact model（产物数据模型） | ✅ 已完成 |
| yd5.3 | artifacts panel（渲染面板） | ✅ 已完成 |
| yd5.4 | derive_artifact（图片→HTML 原型执行链） | ✅ 已完成 |
| yd5.5 | KainClaw Design bridge（入口桥接） | 🔄 进行中 |
