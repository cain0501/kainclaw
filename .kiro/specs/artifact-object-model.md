# Spec: Artifact Object Model（产物对象模型）

**状态**：草稿，待 Codex 技术评审  
**作者**：Claude（PM 角色）  
**评审**：Codex（技术可行性）  
**日期**：2026-05-01  
**版本**：v3（修订：加 unwrapSingleOuterFence 预处理、明确 fenced markdown 行为、补 SVG 默认标题）

---

## 一、问题背景

### 当前现状

系统目前对"产物"没有统一的数据模型。现有的上下文追踪仅有：

- `latestGeneratedImage: string | null` — 最近生成的图片 URL（存在 `ElectronChatPanel.ts` 中）
- LLM 输出的文字内容直接渲染为聊天气泡，无类型区分，无独立生命周期

### 缺少什么

当 LLM 产出 HTML 原型、SVG 图表、Mermaid 架构图或代码块时：

1. **没有检测机制**：系统不知道这是"可渲染产物"还是普通文字
2. **没有注册表**：无法追踪"当前有哪些产物"、"哪个是活跃的"
3. **无法触发面板**：没有数据层支撑，Artifacts 面板（PR3）无法实现
4. **无法传递给 Deep Design**：derive_artifact（PR4）和 Design Lab 桥接（PR5）都依赖本层

### 与现有图片上下文的关系

图片的 `latestGeneratedImage` 是目前唯一存在的"产物上下文"，仅用于 `image_edit` 路由判断。
本 spec **不重构图片上下文**（保持 `latestGeneratedImage` 不变），专注于文字类产物（HTML/SVG/Mermaid/code/markdown）的数据模型定义。
未来 PR6 可考虑将图片纳入统一 artifact registry，但不在当前范围内。

---

## 二、目标

定义 Artifact Object Model，作为 PR3（面板渲染）、PR4（derive_artifact 执行链）、PR5（Deep Design 桥接）的数据层基础。

本 spec 只涉及**类型定义、检测规则、注册表逻辑、渲染契约、Deep Edit 显示规则**，不包含 UI 实现。

**明确不在范围内**：
- Artifacts 面板的 UI 实现（PR3 负责）
- `derive_artifact` 执行链（PR4 负责）
- Deep Design 页面本身（PR5 负责）
- 图片类产物纳入统一注册表（未来 PR6）
- 产物跨会话持久化（V2）

---

## 三、方案设计

### 3.1 核心数据结构

```typescript
// src/artifacts/artifactObject.ts

export type ArtifactType =
  | "html"      // 交互式原型、仪表板、营销页
  | "svg"       // 矢量图、可视化图表
  | "mermaid"   // 架构图、流程图、时序图
  | "code"      // TypeScript、Python、JavaScript 等
  | "markdown"; // 保留供未来使用，V1 不自动检测产出

export interface ArtifactObject {
  id: string;                          // UUID
  type: ArtifactType;
  content: string;                     // 原始内容
  sourceMessageId?: string;            // 可选；集成层（PR3）在 push() 时补入；当前 ChatMessage 无稳定 ID
  title: string;                       // 从内容提取或自动生成
  createdAt: number;                   // Unix 毫秒时间戳
  metadata?: {
    language?: string;                 // code 类型专用（"typescript"、"python" 等）
    lineCount?: number;                // 产物行数
    [key: string]: unknown;            // 为未来扩展预留
  };
}
```

### 3.2 Artifact Type Registry（注册表）

注册表维护当前会话内所有已产出的产物。

```typescript
// src/artifacts/artifactRegistry.ts

export interface ArtifactRegistry {
  artifacts: ArtifactObject[];         // 按产出时间排序，最新在最后
  activeArtifactId: string | null;     // 当前面板展示的产物 ID
}
```

注册表职责：
- `push(artifact)` — 添加新产物，自动将其设为 `activeArtifactId`
- `setActive(id)` — 用户手动选择某个历史产物
- `dismiss()` — 用户关闭面板，`activeArtifactId` 置 `null`（产物仍保留在列表中）
- `clear()` — 会话重置时清空所有产物

### 3.3 产物检测规则（Detection Rules）

检测作用于 LLM 输出的原始文字，**不走 LLM 判断**，用确定性规则。

#### 预处理：unwrapSingleOuterFence()

LLM 常把完整 HTML/SVG/Mermaid 包在一层代码围栏里（如 ` ```html\n<!DOCTYPE html>...\n``` `）。
检测前必须先做一次去外层围栏：

| 外层围栏语言标记 | 预处理行为 |
|---|---|
| ` ```html ` | 去掉围栏，内容作为裸 HTML 继续判定 |
| ` ```svg ` | 去掉围栏，内容作为裸 SVG 继续判定 |
| ` ```mermaid ` | 去掉围栏，内容作为裸 Mermaid 继续判定 |
| ` ```markdown ` | **V1 返回 `null`**，不产生 artifact（原因见下） |
| 其他 ` ```language ` | 保留围栏语言标记，继续判定（会落 `code`） |

"单层外围栏"定义：整段内容只被一对 ` ``` ` 包裹，去掉后内容无其他围栏。嵌套围栏不触发预处理。

#### 类型判定（预处理后）

| 匹配条件 | 判定类型 | 说明 |
|---|---|---|
| 以 `<!DOCTYPE html>` 或 `<html` 开头 | `html` | 包括经过去围栏的 fenced html |
| 以 `<svg` 开头或含 `xmlns="…svg"` | `svg` | 包括经过去围栏的 fenced svg |
| 含 mermaid 语法（去围栏后为纯 Mermaid 内容） | `mermaid` | content 存储去围栏后的纯语法，不含围栏标记 |
| 含代码围栏且未命中 html/svg/mermaid/markdown 预处理规则 | `code` | 有语言名则写入 `metadata.language`，无语言名则 `undefined` |

优先级：`mermaid` > `html` > `svg` > `code`（当一段内容同时命中多条规则时，取最高优先级）。

**V1 不对 markdown 进行自动检测**：
- ` ```markdown ` 围栏内容 → `null`，不产生 artifact（既不是 `code`，也不是 `markdown` artifact）
- 无围栏的长篇文字回复（需求分析、review 报告等）→ `null`，留在聊天流
- markdown 类型保留在枚举中供未来显式标记使用（见第十节）

**不产生产物**的情形（不触发注册）：
- 纯对话回复（无 html / svg / mermaid / code 特征标记）
- ` ```markdown ` 围栏内容
- `prompt_rewrite` 路由下的输出（文字 brief，不含可渲染结构）
- 图片 URL / base64 输出（走现有图片管道，不走 artifact 管道）

检测时机：`sendPrompt()` 的 streaming 结束后，对完整 `fullText` 执行一次检测。

### 3.4 Active Object 选取规则

| 事件 | `activeArtifactId` 变化 |
|---|---|
| 新产物被 push 进注册表 | 自动设为新产物的 ID |
| 用户点击面板中的"历史产物列表"某项 | 设为该项 ID |
| 用户点击面板关闭按钮 | 置 `null`（注册表保留产物） |
| 用户开始新的聊天会话 | **集成方应调用 `clear()`**（注册表本身不感知会话生命周期） |
| `image_edit` 或 `image_generate` 轮次 | **不影响** `activeArtifactId`（两套上下文独立） |

### 3.5 面板渲染契约（Panel Rendering Contract）

> **Informative contract**：本节内容为 PR3 实现的参考约束，不属于 PR2 的交付物。PR2 只交付数据层，渲染实现由 PR3 负责。

面板在 PR3 中实现，本 spec 只定义**渲染方式合约**，供 PR3 直接遵照执行：

| ArtifactType | 渲染方式 | 安全约束 |
|---|---|---|
| `html` | `<iframe sandbox="allow-scripts" srcdoc="…">` | 禁止 `allow-same-origin`、`allow-forms`、`allow-top-navigation` |
| `svg` | `<iframe sandbox="allow-scripts" srcdoc="<html><body>${svg}</body></html>">` | 同 html |
| `mermaid` | `<iframe sandbox="allow-scripts">` 内运行 mermaid.js 渲染 | mermaid.js 以 CDN 或内联方式引入，不使用外部网络请求 |
| `code` | 语法高亮代码块（非 iframe，复用现有 code 渲染） | 无特殊要求 |
| `markdown` | 渲染后 markdown（非 iframe，复用现有 markdown 渲染） | 无特殊要求 |

**内容来源**：面板总是读取 `activeArtifact.content`，不重新请求 LLM。

### 3.6 Deep Edit 按钮显示规则

"进入 Deep Design" 按钮显示在面板右上角，**仅基于产物类型决定，不走 LLM 判断**：

| ArtifactType | 是否显示 Deep Edit | 原因 |
|---|---|---|
| `html` | ✅ 显示 | slider 微调价值最高（颜色、间距、字体） |
| `svg` | ❌ V1 隐藏 | CSS 提取结构未就绪，V2 可开启 |
| `mermaid` | ❌ 隐藏 | 结构为主，样式调节价值低 |
| `code` | ❌ 隐藏 | 应进代码编辑器，不进设计工具 |
| `markdown` | ❌ 隐藏 | 纯文字直接编辑即可 |

点击 Deep Edit 后的行为（由 PR5 实现，本 spec 只定义数据接口）：
- 把 `activeArtifact.content`（HTML 字符串）通过 IPC 传递给 Design Lab 页面
- Design Lab 以该 HTML 作为初始版本，进入 slider 微调流程

---

## 四、文件变更范围

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/artifacts/artifactObject.ts` | **新建** | `ArtifactObject` / `ArtifactType` 类型定义（~20 行） |
| `src/artifacts/artifactRegistry.ts` | **新建** | `ArtifactRegistry` 状态管理 + CRUD 方法（~40 行） |
| `src/artifacts/artifactRegistry.test.ts` | **新建** | 注册表逻辑单元测试（见第五节 5.2） |
| `src/artifacts/artifactDetector.ts` | **新建** | 产物类型检测逻辑（~50 行） |
| `src/artifacts/artifactDetector.test.ts` | **新建** | 检测规则单元测试（见第五节 5.1） |

变更文件数：5，在 AGENTS.md 的 8 文件警戒线内。

**不涉及以下文件**（本 spec 范围内不改动）：
- `electron/ElectronChatPanel.ts` — 集成点留给 PR3
- `src/imageGeneration/` — 保持不变

---

## 五、测试要求

### 5.1 产物检测单元测试（artifactDetector.test.ts）

```
预处理 + 正向用例：
- 裸 HTML（<!DOCTYPE html> 开头）→ html
- fenced html（```html\n<!DOCTYPE html>...\n```）→ 去围栏后 → html（主路径）
- 裸 SVG（<svg 开头）→ svg
- fenced svg（```svg\n<svg...>\n```）→ 去围栏后 → svg
- fenced mermaid（```mermaid\ngraph...\n```）→ 去围栏后 → mermaid，content 不含围栏标记
- Python 代码围栏 → code，metadata.language = "python"
- TypeScript 代码围栏 → code，metadata.language = "typescript"

边界用例：
- 长篇文字回复（无任何标记）→ null（不产生 artifact）
- fenced markdown（```markdown\n# 标题\n...\n```）→ null（V1 不产生 artifact，不是 code）
- prompt_rewrite 输出的优化后提示词（纯文字）→ null
- 图片 URL 字符串 → null
- 既含 ```mermaid 围栏又含其他代码围栏的混合文本 → mermaid（优先级最高）
- code 围栏但语言名为空（```\n...\n```）→ code，metadata.language = undefined
- 嵌套围栏（HTML 内含代码块）→ 不触发预处理，按类型判定规则正常处理

title 提取：
- HTML 含 <title>我的原型</title> → title = "我的原型"
- HTML 无 title 标签 → title = "HTML 原型"（类型默认值）
- SVG（无内嵌 title 元素）→ title = "SVG 图形"（类型默认值）
- Mermaid 代码 → title = "架构图"（类型默认值）
- code（python）→ title = "Python 代码"（语言默认值）
- code（语言未知）→ title = "代码"（兜底默认值）
```

### 5.2 注册表逻辑单元测试（可内联在 artifactRegistry.test.ts）

```
- push() 后 activeArtifactId === 新产物 id
- push() 两次后 activeArtifactId === 第二次产物 id，第一次产物仍在 artifacts 列表
- setActive(id) 切换 activeArtifactId
- dismiss() 后 activeArtifactId === null，artifacts 列表不变
- clear() 后 artifacts 为空，activeArtifactId === null
```

---

## 六、验收标准

- [ ] `ArtifactObject` / `ArtifactType` 类型定义完整导出，可被 PR3/PR4/PR5 直接 import
- [ ] 5.1 全部检测用例通过
- [ ] 5.2 全部注册表逻辑用例通过
- [ ] `artifactDetector` 对 HTML / SVG / mermaid / code 全部有正向 + 边界测试（含 fenced 变体）
- [ ] fenced html 和 fenced svg 正确判为 `html` / `svg`，不误判为 `code`
- [ ] fenced markdown 返回 `null`，不产生 artifact，不误判为 `code`
- [ ] `metadata.language` 对 code 类型正确写入
- [ ] Deep Edit 显示规则以常量导出，PR3 无需自行判断
- [ ] `npm run build` 通过，无 TypeScript 报错
- [ ] 不修改 `ElectronChatPanel.ts`，不修改 `imageGeneration/` 任何文件

---

## 七、风险与约束

| 风险 | 缓解措施 |
|---|---|
| fenced html/svg 被误判为 `code` | `unwrapSingleOuterFence()` 预处理先去掉外层围栏，再按内容类型判定；单元测试覆盖 fenced html 主路径 |
| `prompt_rewrite` 输出被误识为 artifact | 检测基于结构特征（html 标签/围栏），纯文字 brief 无任何标记，不会触发 |
| fenced markdown 被误判为 `code` | 预处理显式拦截 ` ```markdown ` 并返回 `null`，独立于 code 判定路径 |
| mermaid 围栏提取出错 | 单元测试明确覆盖"去围栏后 content 不含围栏标记"这一契约 |
| PR3/PR4/PR5 对数据结构有隐含假设 | 本 spec 先定义，三个 PR 必须以本 spec 的类型为唯一 import 来源，不得各自定义 |
| `sourceMessageId` 为可选导致追踪链断裂 | PR3 集成时补入；PR2 本身只定义数据模型，不强制要求上游 |

---

## 八、与 AGENTS.md 的对齐检查

- ✅ 新能力落到 `src/artifacts/` 新模块，不堆进 `ElectronChatPanel.ts`
- ✅ 变更文件数 ≤ 8
- ✅ 不触碰图片管道，改动可独立回退
- ✅ 遵循"最小改动满足目标"原则（纯数据层，无 UI）
- ✅ 不触碰高风险区域（`webviewHtml.ts`、`extension.ts`、`licenseManager.ts`）

---

## 九、下游 PR 依赖关系

```
PR2（本 spec） → PR3（Artifacts 面板 UI + iframe 渲染）
                 → PR4（derive_artifact：图片 → HTML 原型）
                 → PR5（Deep Design 桥接：Artifacts → Design Lab）
```

PR3/PR4/PR5 均以 `src/artifacts/artifactObject.ts` 为唯一产物类型来源，不允许各自定义类型。

---

## 十、未来可选增强（不在本 spec 范围）

- **markdown 自动检测**：增加显式 marker（如 `<!-- artifact -->`）或文档长度 + 标题结构组合规则，让长篇文档类回复也能进入 artifact 面板；当前因误触发风险过高而推迟
- **图片纳入统一注册表**：将 `latestGeneratedImage` 迁移至 `ArtifactObject { type: "image" }`，统一 `activeArtifact` 上下文，替换掉 `hasRecentGeneratedImageContext` 的布尔信号
- **跨会话持久化**：将 `ArtifactRegistry` 序列化到 workspace storage，支持重启后恢复
- **产物历史导航 UI**：面板内"←上一个/下一个→"导航控件
- **SVG Deep Edit 支持**：CSS 提取能力就绪后，开启 SVG 的 Deep Edit 按钮
- **ChatMessage 稳定 ID**：给聊天消息加 UUID，补全 `sourceMessageId` 作为必填字段
