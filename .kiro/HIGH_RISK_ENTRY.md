# High-Risk File Entry Rules

这三个文件是已知的"事故放大器"。进入前必须满足下面所有准入条件。

---

## `electron/renderer/index.html`

**已知事故记录：**
- 重复定义 session/design 函数块 → 点击链混乱
- 误删 `onclick` 引用的函数 → 新建/切会话失效
- inline `<script>` 模板字符串边界断裂 → 直接白屏
- 设置页渲染链局部破坏 → 空白页或只剩标题

**进入准入条件（全部满足才可动）：**
1. Primer 中明确列出：本次允许触碰的具体函数/区域
2. Primer 中明确列出：本次不碰的区域
3. 改动前先搜：`grep -n "onclick=" electron/renderer/index.html` — 确认所有 onclick 指向存在的函数
4. 改动前先搜：本次要改的函数名是否在文件中有重复定义
5. 改完立即执行：`npm run build:electron`
6. 改完立即手测：最短复现路径（新建会话、切会话、刷新页面）

**不允许的操作：**
- 一次改多个逻辑簇
- 把新的 core logic 塞进 inline `<script>`
- 不读上下文就直接 patch

---

## `src/extension.ts`

**已知风险：**
- 激活/ready 流程改错 → 整个扩展无法启动
- session lifecycle 改错 → 会话恢复失败
- license/approval wiring 改错 → 功能门控失效

**进入准入条件（全部满足才可动）：**
1. Primer 中明确列出：本次目标函数/区域（行号范围）
2. 提取前确认：目标逻辑没有隐式依赖 `this` 上的多个字段
3. 提取后搜索：`grep -n "<被提取的函数名>" src/extension.ts` — 确认无残留引用
4. 改完立即：`npm test && npm run check && npm run build`

**不允许的操作：**
- 顺手修复周边看到的问题
- 不验证 build 就关闭任务
- 每次提取超过 1 个逻辑块（除非逻辑耦合强制绑定）

---

## `src/webviewHtml.ts`

**已知风险：**
- 模板字符串内联 HTML/JS 改坏 → 渲染失败
- `escapeHtml()` 绕过 → XSS
- 嵌套引号/模板字符混用 → 静默 JS 语法错误

**进入准入条件（全部满足才可动）：**
1. Primer 中明确列出：要修改的 HTML 区域或函数名
2. 改完立即：`npm run build`（捕获 TS 和语法错误）
3. 如果改了用户可见文案或交互：手测该 UI 区域

**不允许的操作：**
- 在模板字符串里写超过 5 行的 inline JS
- 绕过 `escapeHtml()` 直接拼 user-provided content

---

## 通用规则

- 没有 Primer → 不进高危文件
- Primer 没有指定允许区域 → 不进高危文件
- 不能用"顺手"这个理由扩大修改范围
- 改完必须立即验证，不允许"稍后再跑 build"
