# Office Add-in 生态实现规格

**版本**：v1.0  
**日期**：2026-04-12  
**状态**：待实现（前提：Windows 客户端主进程完成后）  
**负责人**：Codex（实现）/ Claude（PM）

---

## 一、产品目标

对标 Anthropic 官方 Claude for Word，但支持任意 LLM（OpenAI / DeepSeek / 通义 / Claude），面向中国用户，无需 Anthropic 订阅。

**用户体验**：
1. 用户打开 KainClaw Windows 客户端 → 设置面板显示"Word 助手未安装" → 点击安装
2. 用户打开 Word → 右侧出现 KainClaw 侧边栏
3. API Key 和 License 自动从 KainClaw 主进程同步，无需重复配置

---

## 二、架构总览

```
KainClaw Windows 主进程（系统托盘常驻）
├── 主窗口 UI
├── Provider Adapters（现有）
├── License Manager（现有）
├── Settings Repository（现有）
└── Local Bridge Server  ← 新增，localhost:52358
        │
        │  HTTP（仅接受 127.0.0.1 + Office 域名）
        │
   Word Add-in（Office.js 任务窗格）
   ├── taskpane UI（HTML/CSS/TypeScript）
   ├── documentReader.ts
   ├── documentEditor.ts
   ├── commentHandler.ts
   └── bridgeClient.ts  ← 调用 Local Bridge 拿配置
```

---

## 三、Local Bridge Server

### 3.1 位置与职责

文件：`src/officeBridge/localBridgeServer.ts`

职责：
- 暴露 HTTP 接口供 Office Add-in 调用
- 提供当前 KainClaw 的 Provider 配置（不直接暴露原始 API Key，只暴露够用的信息或代理请求）
- 接收 Add-in 的注册通知，更新主进程状态

### 3.2 安全边界

只接受来自以下来源的请求：
- `127.0.0.1` / `localhost`
- `*.officeapps.live.com`（Office 在线版域名）
- `*.office.com`

拒绝所有其他来源，防止网页端横向调用。

### 3.3 接口定义

#### GET /health
```
Response 200: { "status": "ok", "version": "1.0" }
```

#### GET /config
```
Response 200:
{
  "providerType": "anthropic" | "openai" | "openai-compatible" | "claude-cli",
  "model": "claude-opus-4-6",
  "baseUrl": "https://api.openai.com/v1",  // openai-compatible 时有值
  "licenseActive": true,
  "proxyMode": true   // true = Add-in 通过 /proxy 转发请求，不直接拿 Key
}
```

> **注意**：不要直接返回 API Key 明文。推荐用 `proxyMode: true`，Add-in 把请求发到 `/proxy`，由主进程转发给 LLM，API Key 留在主进程里。

#### POST /proxy
```
Request Body:
{
  "messages": [...],   // NormalizedMessage[]
  "tools": [...],      // 可选
  "stream": true
}

Response: SSE 流式输出，格式复用现有 anthropicAdapter / openAIAdapter 的流式协议
```

#### POST /register
```
Request Body: { "source": "word-addin" | "excel-addin" | "ppt-addin" }
Response 200: { "ok": true }

副作用：主进程更新对应工具状态为"已连接"，触发主窗口 UI 刷新
```

### 3.4 实现代码

```typescript
// src/officeBridge/localBridgeServer.ts

import * as http from "http";
import type { IncomingMessage, ServerResponse } from "http";

export type BridgeConfig = {
  providerType: string;
  model: string;
  baseUrl?: string;
  licenseActive: boolean;
  proxyMode: boolean;
};

export type RegisteredAddin = "word-addin" | "excel-addin" | "ppt-addin";

export class LocalBridgeServer {
  private server: http.Server | null = null;
  private readonly port = 52358;
  private readonly allowedOrigins = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/[a-z0-9-]+\.officeapps\.live\.com$/,
    /^https?:\/\/[a-z0-9-]+\.office\.com$/,
  ];

  constructor(
    private readonly getConfig: () => BridgeConfig,
    private readonly handleProxy: (body: unknown, res: ServerResponse) => Promise<void>,
    private readonly onRegister: (source: RegisteredAddin) => void,
  ) {}

  start(): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[LocalBridge] listening on 127.0.0.1:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.allowedOrigins.some(pattern => pattern.test(origin));
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const origin = (req.headers.origin as string) ?? "";

    if (origin && !this.isAllowedOrigin(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "1.0" }));
      return;
    }

    if (req.url === "/config" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.getConfig()));
      return;
    }

    if (req.url === "/proxy" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        void this.handleProxy(JSON.parse(body), res);
      });
      return;
    }

    if (req.url === "/register" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        const { source } = JSON.parse(body) as { source: RegisteredAddin };
        this.onRegister(source);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  }
}
```

### 3.5 Windows 客户端主进程集成

```typescript
// 在 Windows 客户端主进程启动时初始化
const bridge = new LocalBridgeServer(
  () => ({
    providerType: settings.getActiveProvider().type,
    model: settings.getActiveProvider().model ?? "",
    baseUrl: settings.getActiveProvider().baseUrl,
    licenseActive: licenseManager.isActive(),
    proxyMode: true,
  }),
  async (body, res) => {
    // 复用现有 Provider Adapter 转发请求
    const adapter = buildProviderAdapter(settings.getActiveProvider(), ...);
    // 走 SSE 流式响应
    // ...
  },
  (source) => {
    mainWindow.webContents.send("office-addin-registered", { source });
  },
);

bridge.start();
app.on("before-quit", () => bridge.stop());
```

---

## 四、Word Add-in

### 4.1 技术选型

- **Office.js**（Task Pane Add-in）：支持 Word on Web / Windows / Mac
- 不用 VSTO：VSTO 仅 Windows，Office.js 跨平台
- 打包工具：Webpack + TypeScript
- 发布方式：先走 manifest 文件本地安装（开发期），再上 Microsoft AppSource（正式发布）

### 4.2 目录结构

```
office-addin/
├── manifest.xml          ← Office Add-in 清单文件
├── package.json
├── webpack.config.js
└── src/
    ├── taskpane/
    │   ├── taskpane.html    ← 侧边栏 UI 入口
    │   ├── taskpane.css
    │   └── taskpane.ts      ← UI 逻辑
    ├── bridgeClient.ts      ← 调用 Local Bridge
    ├── documentReader.ts    ← 读文档
    ├── documentEditor.ts    ← 改文档
    └── commentHandler.ts    ← 批注处理
```

### 4.3 manifest.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xsi:type="TaskPaneApp"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Id>REPLACE-WITH-UUID</Id>
  <Version>1.0.0</Version>
  <ProviderName>KainClaw</ProviderName>
  <DefaultLocale>zh-CN</DefaultLocale>
  <DisplayName DefaultValue="KainClaw AI 助手"/>
  <Description DefaultValue="支持任意 LLM 的 Word AI 助手"/>
  <Hosts>
    <Host Name="Document"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://localhost:3000/taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides">
    <Hosts>
      <Host xsi:type="Document">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl"/>
          </GetStarted>
          <FunctionFile resid="Commands.Url"/>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="CommandsGroup">
                <Label resid="CommandsGroup.Label"/>
                <Control xsi:type="Button" id="ShowTaskpane">
                  <Label resid="ShowTaskpane.Label"/>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>ButtonId1</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
  </VersionOverrides>
</OfficeApp>
```

### 4.4 bridgeClient.ts

```typescript
// src/bridgeClient.ts

const BRIDGE_URL = "http://127.0.0.1:52358";

export type BridgeConfig = {
  providerType: string;
  model: string;
  baseUrl?: string;
  licenseActive: boolean;
  proxyMode: boolean;
};

export async function fetchBridgeConfig(): Promise<BridgeConfig | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/config`);
    if (!res.ok) return null;
    return res.json() as Promise<BridgeConfig>;
  } catch {
    return null;  // KainClaw 未运行
  }
}

export async function registerAddin(): Promise<void> {
  try {
    await fetch(`${BRIDGE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "word-addin" }),
    });
  } catch {
    // 静默失败，不影响 Add-in 正常使用
  }
}

export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<string> {
  const res = await fetch(`${BRIDGE_URL}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: true }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // 解析 SSE data: ... 格式
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const { token } = JSON.parse(data) as { token: string };
          yield token;
        } catch { /* skip */ }
      }
    }
  }
}
```

### 4.5 documentReader.ts — 读文档（含位置标记）

```typescript
// src/documentReader.ts

export type Paragraph = {
  id: string;        // "p0", "p1", ...，用于引用跳转
  text: string;
  style: string;     // "Heading 1", "Normal", etc.
  isEmpty: boolean;
};

export type DocumentSnapshot = {
  paragraphs: Paragraph[];
  fullText: string;
  charCount: number;
};

export async function readDocument(): Promise<DocumentSnapshot> {
  return Word.run(async context => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load(["text", "style"]);
    await context.sync();

    const items: Paragraph[] = paragraphs.items.map((p, i) => ({
      id: `p${i}`,
      text: p.text,
      style: p.style,
      isEmpty: p.text.trim() === "",
    }));

    return {
      paragraphs: items,
      fullText: items.map(p => p.text).join("\n"),
      charCount: items.reduce((n, p) => n + p.text.length, 0),
    };
  });
}

/** 把文档内容拼成带位置标记的 prompt 上下文 */
export function buildDocumentContext(snapshot: DocumentSnapshot): string {
  return snapshot.paragraphs
    .filter(p => !p.isEmpty)
    .map(p => `[${p.id}] ${p.text}`)
    .join("\n");
}

/** 从 LLM 回答里提取引用的段落 ID */
export function extractCitations(reply: string): string[] {
  const matches = reply.matchAll(/\[p(\d+)\]/g);
  return [...new Set([...matches].map(m => `p${m[1]}`))];
}

/** 跳转到指定段落 ID */
export async function navigateToParagraph(paragraphId: string): Promise<void> {
  const index = parseInt(paragraphId.slice(1), 10);
  await Word.run(async context => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();
    const target = paragraphs.items[index];
    if (target) {
      target.select();
      await context.sync();
    }
  });
}
```

### 4.6 documentEditor.ts — 编辑选中文字 + Track Changes

```typescript
// src/documentEditor.ts

/** 替换当前选中内容，保留周围样式 */
export async function replaceSelection(newText: string): Promise<void> {
  await Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load(["text", "style"]);
    await context.sync();

    // insertText replace 会继承段落样式
    selection.insertText(newText, Word.InsertLocation.replace);
    await context.sync();
  });
}

/** 进入 Track Changes 模式编辑 */
export async function replaceSelectionWithTracking(newText: string): Promise<void> {
  await Word.run(async context => {
    // 开启修订追踪（仅追踪本次操作）
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackMineOnly;
    await context.sync();

    const selection = context.document.getSelection();
    selection.insertText(newText, Word.InsertLocation.replace);
    await context.sync();

    // 操作完成后关闭追踪，避免影响用户后续输入
    context.document.changeTrackingMode = Word.ChangeTrackingMode.off;
    await context.sync();
  });
}

/** 获取当前选中文字 */
export async function getSelectedText(): Promise<string> {
  return Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    return selection.text;
  });
}
```

### 4.7 commentHandler.ts — 批注处理

```typescript
// src/commentHandler.ts

export type DocumentComment = {
  id: string;
  content: string;         // 批注文字
  anchoredText: string;    // 批注锚定的原文
};

export async function getOpenComments(): Promise<DocumentComment[]> {
  return Word.run(async context => {
    // Word.js API: document.body.getComments()
    // 注意：getComments 在 Word 2019+ / M365 可用
    const comments = context.document.body.getComments();
    comments.load(["id", "content", "contentRange"]);
    await context.sync();

    const result: DocumentComment[] = [];
    for (const c of comments.items) {
      c.content.load("items");
      c.contentRange.load("text");
      await context.sync();

      result.push({
        id: c.id,
        content: c.content.items.map(i => i.text).join(""),
        anchoredText: c.contentRange.text,
      });
    }
    return result;
  });
}

/** 回复批注并编辑锚定文字 */
export async function resolveComment(
  commentId: string,
  editedText: string,
  replyText: string,
): Promise<void> {
  await Word.run(async context => {
    const comments = context.document.body.getComments();
    comments.load(["id", "contentRange"]);
    await context.sync();

    const target = comments.items.find(c => c.id === commentId);
    if (!target) return;

    target.contentRange.load("text");
    await context.sync();

    // 替换锚定文字
    target.contentRange.insertText(editedText, Word.InsertLocation.replace);

    // 回复批注
    target.reply(replyText);

    await context.sync();
  });
}
```

---

## 五、KainClaw 主窗口 UI 变更

### 5.1 设置面板新增"工具生态"页

```
左侧导航新增一栏：
  提供商 & 模型
  权限
  外观
  工具生态     ← 新增
  License
  关于
```

### 5.2 工具生态页内容

```
┌─────────────────────────────────────┐
│  工具生态                            │
├─────────────────────────────────────┤
│                                     │
│  ✅ VS Code 助手    已激活           │
│                                     │
│  ⬜ Word 助手       未安装           │
│     支持问答、编辑、Track Changes     │
│     [ 安装 Word Add-in ]            │
│                                     │
│  🔜 Excel 助手      即将推出         │
│  🔜 PowerPoint 助手 即将推出         │
│                                     │
└─────────────────────────────────────┘
```

### 5.3 检测已安装状态

Office Add-in 启动时调用 `POST /register`，主进程收到后更新状态。

```typescript
// 主进程维护 addin 状态
type AddinStatus = {
  wordAddin: "not-installed" | "connected" | "disconnected";
  excelAddin: "not-installed" | "connected" | "disconnected";
};
```

断连检测：每 30 秒向 Add-in 发一次心跳（或通过 Add-in 定时 GET /health 来保活），超时则标为 `disconnected`。

### 5.4 安装引导

点击"安装 Word Add-in"后：
1. 打开浏览器跳转到 Microsoft AppSource 页面（正式上线后）
2. 开发期：弹出说明弹窗，指引用户手动 sideload manifest.xml

---

## 六、大文档分块策略

Word 文档可能几万字，超过 LLM 的 context window。

### 策略：语义相关段落优先

1. 用户发问时，先做关键词匹配，提取最相关的 N 段
2. 如果是"分析整篇文档"类问题，按章节分块，每块单独问，最后合并结论
3. 每次发给 LLM 的上下文控制在 8000 token 以内（可配置）

```typescript
function selectRelevantParagraphs(
  paragraphs: Paragraph[],
  query: string,
  maxTokens = 8000,
): Paragraph[] {
  // 简单实现：关键词匹配排序
  const keywords = query.toLowerCase().split(/\s+/);
  const scored = paragraphs.map(p => ({
    paragraph: p,
    score: keywords.filter(kw => p.text.toLowerCase().includes(kw)).length,
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected: Paragraph[] = [];
  let tokens = 0;
  for (const { paragraph } of scored) {
    const est = Math.ceil(paragraph.text.length / 4); // 粗估 token 数
    if (tokens + est > maxTokens) break;
    selected.push(paragraph);
    tokens += est;
  }
  return selected;
}
```

---

## 七、Excel Add-in

### 7.1 核心功能

对标 Claude for Excel 官方功能：
- **带单元格引用的问答**：LLM 回答中引用具体单元格（如 `[A1:B10]`），点击可跳转定位
- **更新假设值**：修改驱动单元格的数值，同时保留下游公式依赖关系
- **调试错误**：分析并修复 `#REF!`、`#VALUE!`、`#N/A`、循环引用等公式错误
- **构建新模型 / 填充模板**：根据自然语言描述生成表格结构或填入现有模板
- **多 sheet 导航**：理解跨 sheet 的公式引用，在复杂工作簿中定位关键单元格
- **数据透视表编辑**：调整排序、筛选条件和 schema
- **图表编辑**：修改坐标轴、标签、图例和数据范围
- **条件格式**：基于值/公式规则设置数据条、色阶、图标集
- **排序与筛选 / 数据验证**：操作列表和下拉约束
- **财务格式化**：整理打印区域、网格线、页眉页脚

### 7.2 目录结构

```
office-addin/
└── excel/
    ├── manifest.xml
    ├── package.json
    ├── webpack.config.js
    └── src/
        ├── taskpane/
        │   ├── taskpane.html
        │   ├── taskpane.css
        │   └── taskpane.ts
        ├── bridgeClient.ts      ← 复用 Word 同款，只改 source="excel-addin"
        ├── excelReader.ts       ← 读取工作簿内容
        └── excelEditor.ts       ← 修改单元格、公式、透视表、图表
```

### 7.3 manifest.xml（Excel）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xsi:type="TaskPaneApp"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Id>REPLACE-WITH-UUID-EXCEL</Id>
  <Version>1.0.0</Version>
  <ProviderName>KainClaw</ProviderName>
  <DefaultLocale>zh-CN</DefaultLocale>
  <DisplayName DefaultValue="KainClaw AI 助手 - Excel"/>
  <Description DefaultValue="支持任意 LLM 的 Excel AI 助手"/>
  <Hosts>
    <Host Name="Workbook"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://localhost:3001/taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides">
    <Hosts>
      <Host xsi:type="Workbook">
        <DesktopFormFactor>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="KainClawGroup">
                <Label resid="KainClawGroup.Label"/>
                <Control xsi:type="Button" id="ShowTaskpane">
                  <Label resid="ShowTaskpane.Label"/>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>KainClawExcel</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
  </VersionOverrides>
</OfficeApp>
```

### 7.4 excelReader.ts — 读取工作簿内容

```typescript
// src/excelReader.ts

export type CellInfo = {
  address: string;   // "A1", "B3:D10" 等，用于引用跳转
  value: string;     // 显示值（公式的计算结果）
  formula: string;   // 原始公式，如 "=SUM(A1:A10)"
  hasError: boolean;
};

export type SheetSnapshot = {
  name: string;
  usedRange: CellInfo[][];   // 二维数组，行 × 列
  rowCount: number;
  colCount: number;
};

export type WorkbookSnapshot = {
  sheets: SheetSnapshot[];
  activeSheet: string;
};

/** 读取整个工作簿（所有 sheet 的已用区域） */
export async function readWorkbook(): Promise<WorkbookSnapshot> {
  return Excel.run(async context => {
    const sheets = context.workbook.worksheets;
    sheets.load(["name", "id"]);
    await context.sync();

    const activeSheet = context.workbook.worksheets.getActiveWorksheet();
    activeSheet.load("name");
    await context.sync();

    const snapshots: SheetSnapshot[] = [];
    for (const sheet of sheets.items) {
      const usedRange = sheet.getUsedRange();
      usedRange.load(["values", "formulas", "address", "rowCount", "columnCount"]);
      await context.sync();

      const cells: CellInfo[][] = [];
      for (let r = 0; r < usedRange.rowCount; r++) {
        const row: CellInfo[] = [];
        for (let c = 0; c < usedRange.columnCount; c++) {
          const val = String(usedRange.values[r][c] ?? "");
          const formula = String(usedRange.formulas[r][c] ?? "");
          // 单元格地址：用 getCellOrNullObject 获取精确地址
          const cell = sheet.getRangeByIndexes(r, c, 1, 1);
          cell.load("address");
          await context.sync();
          row.push({
            address: cell.address.replace(/^[^!]+!/, ""), // 去掉 sheet 前缀
            value: val,
            formula,
            hasError: val.startsWith("#"),
          });
        }
        cells.push(row);
      }

      snapshots.push({
        name: sheet.name,
        usedRange: cells,
        rowCount: usedRange.rowCount,
        colCount: usedRange.columnCount,
      });
    }

    return { sheets: snapshots, activeSheet: activeSheet.name };
  });
}

/** 构建带单元格地址标记的 prompt 上下文（每行一条，含地址） */
export function buildWorkbookContext(snapshot: WorkbookSnapshot, maxTokens = 8000): string {
  const lines: string[] = [];
  let tokens = 0;

  for (const sheet of snapshot.sheets) {
    lines.push(`\n## Sheet: ${sheet.name}`);
    for (const row of sheet.usedRange) {
      const rowStr = row
        .filter(c => c.value !== "")
        .map(c => `[${c.address}]${c.formula ? "(formula)" : ""}: ${c.value}`)
        .join("  |  ");
      if (!rowStr) continue;
      const est = Math.ceil(rowStr.length / 4);
      if (tokens + est > maxTokens) break;
      lines.push(rowStr);
      tokens += est;
    }
  }
  return lines.join("\n");
}

/** 从 LLM 回答里提取引用的单元格地址 */
export function extractCellCitations(reply: string): string[] {
  // 匹配 [A1], [B2:C10], [SheetName!A1] 等
  const matches = reply.matchAll(/\[([A-Z]+\d+(?::[A-Z]+\d+)?)\]/g);
  return [...new Set([...matches].map(m => m[1]))];
}

/** 跳转到指定单元格地址 */
export async function navigateToCell(address: string, sheetName?: string): Promise<void> {
  await Excel.run(async context => {
    let range: Excel.Range;
    if (sheetName) {
      range = context.workbook.worksheets.getItem(sheetName).getRange(address);
    } else {
      range = context.workbook.worksheets.getActiveWorksheet().getRange(address);
    }
    range.select();
    await context.sync();
  });
}

/** 获取所有公式错误单元格 */
export async function getErrorCells(): Promise<CellInfo[]> {
  return Excel.run(async context => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const usedRange = sheet.getUsedRange();
    usedRange.load(["values", "formulas", "address"]);
    await context.sync();

    const errors: CellInfo[] = [];
    for (let r = 0; r < usedRange.rowCount; r++) {
      for (let c = 0; c < usedRange.columnCount; c++) {
        const val = String(usedRange.values[r][c] ?? "");
        if (val.startsWith("#")) {
          const cell = sheet.getRangeByIndexes(r, c, 1, 1);
          cell.load("address");
          await context.sync();
          errors.push({
            address: cell.address.replace(/^[^!]+!/, ""),
            value: val,
            formula: String(usedRange.formulas[r][c] ?? ""),
            hasError: true,
          });
        }
      }
    }
    return errors;
  });
}
```

### 7.5 excelEditor.ts — 修改单元格、公式、透视表、图表

```typescript
// src/excelEditor.ts

/** 更新单个或多个单元格的值（不破坏公式依赖） */
export async function setCellValue(
  address: string,
  value: string | number,
  sheetName?: string,
): Promise<void> {
  await Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    // 如果输入以 "=" 开头，按公式写入；否则按值写入
    if (typeof value === "string" && value.startsWith("=")) {
      range.formulas = [[value]];
    } else {
      range.values = [[value]];
    }
    await context.sync();
  });
}

/** 批量写入单元格（适合模型输出整张表数据的场景） */
export async function bulkSetValues(
  startAddress: string,
  data: (string | number)[][],
  sheetName?: string,
): Promise<void> {
  await Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(startAddress).getResizedRange(
      data.length - 1,
      (data[0]?.length ?? 1) - 1,
    );
    range.values = data;
    await context.sync();
  });
}

/** 修复公式错误：将指定单元格的公式替换为修正后的公式 */
export async function fixFormula(
  address: string,
  correctedFormula: string,
  sheetName?: string,
): Promise<void> {
  await Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    sheet.getRange(address).formulas = [[correctedFormula]];
    await context.sync();
  });
}

/** 获取数据透视表列表 */
export async function listPivotTables(): Promise<string[]> {
  return Excel.run(async context => {
    const pivotTables = context.workbook.pivotTables;
    pivotTables.load("name");
    await context.sync();
    return pivotTables.items.map(pt => pt.name);
  });
}

/** 刷新指定数据透视表 */
export async function refreshPivotTable(name: string): Promise<void> {
  await Excel.run(async context => {
    context.workbook.pivotTables.getItem(name).refresh();
    await context.sync();
  });
}

/** 获取图表列表 */
export async function listCharts(sheetName?: string): Promise<string[]> {
  return Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    const charts = sheet.charts;
    charts.load("name");
    await context.sync();
    return charts.items.map(c => c.name);
  });
}

/** 修改图表标题 */
export async function setChartTitle(
  chartName: string,
  title: string,
  sheetName?: string,
): Promise<void> {
  await Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    const chart = sheet.charts.getItem(chartName);
    chart.title.text = title;
    await context.sync();
  });
}

/** 设置条件格式（按值高亮） */
export async function applyConditionalFormat(
  address: string,
  minValue: number,
  maxValue: number,
  minColor: string,  // 如 "#FF0000"
  maxColor: string,
  sheetName?: string,
): Promise<void> {
  await Excel.run(async context => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    // 先清除已有条件格式
    range.conditionalFormats.clearAll();

    const cf = range.conditionalFormats.add(Excel.ConditionalFormatType.colorScale);
    cf.colorScale.criteria = {
      minimum: {
        color: minColor,
        formula: String(minValue),
        type: Excel.ConditionalFormatColorCriterionType.number,
      },
      maximum: {
        color: maxColor,
        formula: String(maxValue),
        type: Excel.ConditionalFormatColorCriterionType.number,
      },
    };
    await context.sync();
  });
}
```

---

## 八、PowerPoint Add-in

### 8.1 核心功能

对标 Claude for PowerPoint 官方功能：
- **使用企业模板构建新幻灯片**：读取幻灯片母版（Slide Master）和版式的字体、颜色、占位符，确保输出与品牌一致
- **编辑现有幻灯片，保留格式**：只修改文字内容，不破坏现有样式、动画和对象
- **从自然语言生成完整 deck 结构**：根据主题一键生成多页大纲，然后逐页填充
- **将要点转换为图表和本地 PPT 图形**：把文字列表转成柱状图、流程图、SmartArt 等原生 PowerPoint 图形
- **模板感知**：自动识别品牌色和字体，不注入不匹配的样式
- **跨工具上下文接入**：可把 Word 文档或 Excel 数据作为上下文，生成配套演示文稿

### 8.2 目录结构

```
office-addin/
└── powerpoint/
    ├── manifest.xml
    ├── package.json
    ├── webpack.config.js
    └── src/
        ├── taskpane/
        │   ├── taskpane.html
        │   ├── taskpane.css
        │   └── taskpane.ts
        ├── bridgeClient.ts          ← 复用 Word 同款，source="ppt-addin"
        ├── presentationReader.ts    ← 读取幻灯片内容和模板信息
        └── presentationEditor.ts   ← 新增 / 编辑幻灯片
```

### 8.3 manifest.xml（PowerPoint）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xsi:type="TaskPaneApp"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Id>REPLACE-WITH-UUID-PPT</Id>
  <Version>1.0.0</Version>
  <ProviderName>KainClaw</ProviderName>
  <DefaultLocale>zh-CN</DefaultLocale>
  <DisplayName DefaultValue="KainClaw AI 助手 - PowerPoint"/>
  <Description DefaultValue="支持任意 LLM 的 PowerPoint AI 助手"/>
  <Hosts>
    <Host Name="Presentation"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://localhost:3002/taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides">
    <Hosts>
      <Host xsi:type="Presentation">
        <DesktopFormFactor>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="KainClawGroup">
                <Label resid="KainClawGroup.Label"/>
                <Control xsi:type="Button" id="ShowTaskpane">
                  <Label resid="ShowTaskpane.Label"/>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>KainClawPPT</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
  </VersionOverrides>
</OfficeApp>
```

### 8.4 presentationReader.ts — 读取幻灯片内容和模板信息

```typescript
// src/presentationReader.ts

export type SlideShape = {
  id: string;        // shape.id
  type: string;      // "textbox" | "placeholder" | "chart" | "image" | "smartart" | "other"
  text: string;      // 形状内所有文字（含换行）
  placeholderType?: string; // "title" | "body" | "subtitle" 等
};

export type SlideSnapshot = {
  index: number;     // 0-based，用于引用跳转（显示为 slide1, slide2...）
  id: string;        // slide.id（用于跳转）
  layoutName: string;
  shapes: SlideShape[];
  speakerNotes: string;
};

export type ThemeInfo = {
  fontHeading: string;
  fontBody: string;
  accentColors: string[];  // HEX 格式，如 "#2F5496"
};

export type PresentationSnapshot = {
  slides: SlideSnapshot[];
  theme: ThemeInfo;
  slideCount: number;
};

/** 读取整个演示文稿的内容和主题 */
export async function readPresentation(): Promise<PresentationSnapshot> {
  return PowerPoint.run(async context => {
    const presentation = context.presentation;
    const slides = presentation.slides;
    slides.load(["id"]);
    await context.sync();

    // 读取主题（从第一张幻灯片的母版获取）
    const slideMasters = presentation.slideMasters;
    slideMasters.load("items");
    await context.sync();

    let theme: ThemeInfo = { fontHeading: "Calibri", fontBody: "Calibri", accentColors: [] };
    if (slideMasters.items.length > 0) {
      const master = slideMasters.items[0];
      // PowerPoint.js API 当前对 theme 的访问有限，用 XML 读取是更稳健的方式
      // 此处提供 fallback：读取母版名称作为品牌标识
      // 完整实现需要使用 Office Open XML (getCustomXmlParts) 或 customXml API 读取 theme.xml
      master.load("name");
      await context.sync();
      // theme 占位值，实际实现从 slide master XML 解析
      theme = { fontHeading: "Calibri Light", fontBody: "Calibri", accentColors: ["#4472C4", "#ED7D31"] };
    }

    const snapshots: SlideSnapshot[] = [];
    for (let i = 0; i < slides.items.length; i++) {
      const slide = slides.items[i];

      // 读取形状
      const shapes = slide.shapes;
      shapes.load(["id", "type", "name"]);
      await context.sync();

      const shapeSnapshots: SlideShape[] = [];
      for (const shape of shapes.items) {
        // 读取文字框内容
        if (shape.textFrame) {
          shape.textFrame.load("text");
          await context.sync();
          shapeSnapshots.push({
            id: String(shape.id),
            type: "textbox",
            text: shape.textFrame.text ?? "",
          });
        } else {
          shapeSnapshots.push({
            id: String(shape.id),
            type: "other",
            text: "",
          });
        }
      }

      // 读取演讲者备注
      const notes = slide.getNotesSlide();
      const notesBody = notes.body;
      notesBody.load("text");
      await context.sync();

      snapshots.push({
        index: i,
        id: slide.id,
        layoutName: "",  // 需要额外 load layout.name
        shapes: shapeSnapshots,
        speakerNotes: notesBody.text ?? "",
      });
    }

    return { slides: snapshots, theme, slideCount: slides.items.length };
  });
}

/** 构建带幻灯片编号的 prompt 上下文 */
export function buildPresentationContext(snapshot: PresentationSnapshot, maxTokens = 8000): string {
  const lines: string[] = [
    `主题字体：${snapshot.theme.fontHeading}（标题）/ ${snapshot.theme.fontBody}（正文）`,
    `品牌色：${snapshot.theme.accentColors.join(", ")}`,
    `总页数：${snapshot.slideCount}`,
    "",
  ];
  let tokens = 0;

  for (const slide of snapshot.slides) {
    const label = `[slide${slide.index + 1}]`;
    const textBlocks = slide.shapes
      .filter(s => s.text.trim() !== "")
      .map(s => s.text.trim())
      .join(" / ");
    const line = `${label} ${textBlocks}`;
    const est = Math.ceil(line.length / 4);
    if (tokens + est > maxTokens) break;
    lines.push(line);
    if (slide.speakerNotes.trim()) {
      lines.push(`  备注：${slide.speakerNotes.trim()}`);
    }
    tokens += est;
  }
  return lines.join("\n");
}

/** 跳转到指定幻灯片（0-based index） */
export async function navigateToSlide(index: number): Promise<void> {
  await PowerPoint.run(async context => {
    const slides = context.presentation.slides;
    slides.load("items");
    await context.sync();
    if (index < slides.items.length) {
      slides.items[index].setSelectedSlides();
      await context.sync();
    }
  });
}
```

### 8.5 presentationEditor.ts — 新增 / 编辑幻灯片

```typescript
// src/presentationEditor.ts

/** 在末尾新增一张幻灯片，使用指定版式 */
export async function addSlide(layoutName?: string): Promise<string> {
  return PowerPoint.run(async context => {
    const presentation = context.presentation;

    if (layoutName) {
      // 找到匹配的 SlideLayout
      const master = presentation.slideMasters.getItemAt(0);
      const layouts = master.layouts;
      layouts.load(["name", "id"]);
      await context.sync();

      const layout = layouts.items.find(l => l.name === layoutName)
        ?? layouts.items[0]; // 找不到时 fallback 第一个版式

      const newSlide = presentation.slides.add({ slideMasterId: master.id, slideLayoutId: layout.id });
      await context.sync();
      return newSlide.id;
    } else {
      const newSlide = presentation.slides.add();
      await context.sync();
      return newSlide.id;
    }
  });
}

/** 编辑指定幻灯片的文字（按 placeholder 类型定位） */
export async function editSlideText(
  slideIndex: number,
  placeholderType: "title" | "body",
  newText: string,
): Promise<void> {
  await PowerPoint.run(async context => {
    const slides = context.presentation.slides;
    slides.load("items");
    await context.sync();

    if (slideIndex >= slides.items.length) return;
    const slide = slides.items[slideIndex];

    const shapes = slide.shapes;
    shapes.load(["id", "name"]);
    await context.sync();

    for (const shape of shapes.items) {
      // 通过 name 匹配（标准版式里 title placeholder 一般叫 "Title 1"）
      const nameMatch =
        (placeholderType === "title" && shape.name.toLowerCase().includes("title")) ||
        (placeholderType === "body" && (
          shape.name.toLowerCase().includes("content") ||
          shape.name.toLowerCase().includes("body") ||
          shape.name.toLowerCase().includes("text")
        ));

      if (nameMatch && shape.textFrame) {
        shape.textFrame.load("text");
        await context.sync();
        shape.textFrame.getRange().insertText(newText, PowerPoint.InsertLocation.replace);
        await context.sync();
        return;
      }
    }
  });
}

/** 批量插入幻灯片（根据大纲数组，每个元素 = 一页） */
export type SlideOutline = {
  title: string;
  bullets: string[];
  speakerNotes?: string;
};

export async function buildDeckFromOutline(outline: SlideOutline[]): Promise<void> {
  for (const item of outline) {
    await PowerPoint.run(async context => {
      const newSlide = context.presentation.slides.add();
      await context.sync();

      const shapes = newSlide.shapes;
      shapes.load(["name"]);
      await context.sync();

      for (const shape of shapes.items) {
        const name = shape.name.toLowerCase();
        if (name.includes("title") && shape.textFrame) {
          shape.textFrame.getRange().insertText(item.title, PowerPoint.InsertLocation.replace);
        } else if ((name.includes("content") || name.includes("body")) && shape.textFrame) {
          const bodyText = item.bullets.map(b => `• ${b}`).join("\n");
          shape.textFrame.getRange().insertText(bodyText, PowerPoint.InsertLocation.replace);
        }
      }

      // 写入演讲者备注
      if (item.speakerNotes) {
        const notes = newSlide.getNotesSlide();
        const notesBody = notes.body;
        notesBody.load("text");
        await context.sync();
        // NotesSlide body 的第一个 shape 通常是备注文本框
        const noteShapes = notes.shapes;
        noteShapes.load(["name"]);
        await context.sync();
        for (const ns of noteShapes.items) {
          if (ns.name.toLowerCase().includes("content") && ns.textFrame) {
            ns.textFrame.getRange().insertText(item.speakerNotes, PowerPoint.InsertLocation.replace);
          }
        }
      }

      await context.sync();
    });
  }
}

/** 在当前幻灯片插入一个原生柱状图 */
export async function insertBarChart(
  slideIndex: number,
  title: string,
  categories: string[],
  values: number[],
): Promise<void> {
  await PowerPoint.run(async context => {
    const slides = context.presentation.slides;
    slides.load("items");
    await context.sync();

    if (slideIndex >= slides.items.length) return;
    const slide = slides.items[slideIndex];

    // PowerPoint.js 通过 insertChart 插入图表
    // 参数：图表类型、左/上/宽/高（磅）
    const chart = slide.shapes.addChart(
      PowerPoint.ChartType.columnClustered,
      { left: 100, top: 150, width: 500, height: 300 },
    );
    await context.sync();

    // 写入数据
    chart.chartData.setRange(
      [[title, ...categories],
       ["Values", ...values]],
    );
    chart.title.text = title;
    await context.sync();
  });
}
```

---

## 九、跨应用上下文共享

三个 Add-in 的侧边栏在同一次对话中可以互相引用上下文，让用户在 Word、Excel、PowerPoint 之间无缝协作。

### 实现方式

所有 Add-in 把对话历史存储在 Local Bridge 而非 Add-in 本地，通过 `sessionId`（用户桌面唯一值）共享：

```
Local Bridge Server 新增接口：

GET  /session/{sessionId}/context  → 返回该 session 的消息历史
POST /session/{sessionId}/message  → 追加消息（source: "word" | "excel" | "ppt"）
```

Add-in 在初始化时通过 `POST /register` 获得 `sessionId`，后续所有聊天消息都带上 `sessionId`，由 Local Bridge 维护单一对话线程。

这样用户在 Excel 里可以说："把这张表的数据做成 PPT 图表"，切换到 PowerPoint Add-in 后，LLM 仍然记得 Excel 里的数据上下文。

---

## 十、KainClaw 主窗口 UI（更新）

将原 Section 五 的 UI 更新为三个工具全部可用（非"即将推出"）：

```
┌─────────────────────────────────────────────────┐
│  工具生态                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  ✅ VS Code 助手         已激活                  │
│                                                 │
│  ⬜ Word 助手            未安装                  │
│     问答 / 编辑 / Track Changes / 批注处理        │
│     [ 安装 Word Add-in ]                        │
│                                                 │
│  ⬜ Excel 助手           未安装                  │
│     问答 / 单元格引用 / 公式调试 / 图表 / 透视表   │
│     [ 安装 Excel Add-in ]                       │
│                                                 │
│  ⬜ PowerPoint 助手      未安装                  │
│     新建演示 / 编辑幻灯片 / 模板感知 / 从大纲生成  │
│     [ 安装 PowerPoint Add-in ]                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

AddinStatus 类型更新：

```typescript
type AddinStatus = {
  wordAddin:  "not-installed" | "connected" | "disconnected";
  excelAddin: "not-installed" | "connected" | "disconnected";
  pptAddin:   "not-installed" | "connected" | "disconnected";
};
```

---

## 十一、大文档 / 大工作簿分块策略

（原 Section 六，保持不变，同时适用于 Word / Excel / PowerPoint）

所有三个 Add-in 共用同一套分块逻辑，每次发给 LLM 的上下文控制在 8000 token 以内（可在 Local Bridge 配置中调整）。

- Word：按段落关键词评分选取最相关段落（`selectRelevantParagraphs`）
- Excel：按行列遍历，过滤空行，地址标注后截断（`buildWorkbookContext`）
- PowerPoint：按幻灯片顺序遍历，每页内容 + 备注，顺序截断（`buildPresentationContext`）

---

## 十二、实现顺序

### Word（Step 1–8，见原 Section 七）

### Excel（Step 9–12）

#### Step 9：Excel Add-in 骨架
- 创建 `office-addin/excel/` 目录，初始化 Office.js 项目（Host: Workbook）
- 实现 `bridgeClient.ts`（source="excel-addin"）
- 实现基础 `taskpane.html`（Provider 状态显示）
- 验证：Excel 侧边栏能打开，能从 Local Bridge 拿到 config

#### Step 10：工作簿读取 + 基础问答
- 实现 `excelReader.ts`（`readWorkbook`、`buildWorkbookContext`、`extractCellCitations`）
- 侧边栏加输入框，读工作簿内容 → 发给 LLM → 流式显示回答
- 实现 `navigateToCell`，回答中 `[A1]` 渲染为可点击链接
- 验证：能在 Excel 里问"这张表总收入是多少"，回答引用正确单元格并可跳转

#### Step 11：单元格编辑 + 公式修复
- 实现 `excelEditor.ts`（`setCellValue`、`bulkSetValues`、`fixFormula`）
- 侧边栏加"修改单元格"模式：用户描述目标 → LLM 输出 address + value → 写入
- 实现 `getErrorCells`，侧边栏加"调试错误"按钮，列出所有错误单元格
- 验证：公式错误被正确识别，修复后 `#REF!` 消失

#### Step 12：高级功能（透视表 / 图表 / 条件格式）
- 实现 `listPivotTables` / `refreshPivotTable`
- 实现 `listCharts` / `setChartTitle`
- 实现 `applyConditionalFormat`
- 验证：透视表能刷新，图表标题能修改，条件格式色阶能设置

### PowerPoint（Step 13–17）

#### Step 13：PowerPoint Add-in 骨架
- 创建 `office-addin/powerpoint/` 目录，初始化 Office.js 项目（Host: Presentation）
- 实现 `bridgeClient.ts`（source="ppt-addin"）
- 实现基础 `taskpane.html`
- 验证：PowerPoint 侧边栏能打开，能读取当前模板主题色和字体

#### Step 14：演示文稿读取 + 基础问答
- 实现 `presentationReader.ts`（`readPresentation`、`buildPresentationContext`、`navigateToSlide`）
- 侧边栏加输入框，读演示内容 → 发给 LLM → 流式显示回答
- 回答中 `[slide1]` 渲染为可点击链接，点击跳转对应幻灯片
- 验证：能在 PPT 里问"第三页讲了什么"并得到准确回答

#### Step 15：幻灯片编辑
- 实现 `presentationEditor.ts`（`editSlideText`、`addSlide`）
- 侧边栏加"编辑当前幻灯片"模式：用户输入修改意图 → LLM 输出新文字 → 写入
- 验证：编辑后原有格式（字体、大小、对齐）保持不变

#### Step 16：从大纲生成 deck
- 实现 `buildDeckFromOutline`
- 侧边栏加"生成演示"模式：用户输入主题 → LLM 输出 `SlideOutline[]` → 批量插入幻灯片
- 读取母版版式列表，让用户选择要使用的版式
- 验证：10 页演示文稿能在 30 秒内完成，样式与母版一致

#### Step 17：插入原生图表
- 实现 `insertBarChart`（及后续 `insertLineChart`、`insertPieChart`）
- 侧边栏加"插入图表"模式：用户提供数据（或引用 Excel 数据） → 生成原生 PPT 图表
- 验证：图表可在 PowerPoint 图表编辑器中直接编辑数据

### 跨应用（Step 18）

#### Step 18：跨应用上下文共享
- Local Bridge 新增 `/session/{id}/context` 和 `/session/{id}/message` 接口
- 三个 Add-in 的 `bridgeClient.ts` 增加 `sessionId` 参数
- 验证：在 Excel 问的问题，切到 PowerPoint 后 LLM 仍有记忆

### 主窗口 UI（Step 19）

#### Step 19：KainClaw 主窗口 UI 更新
- 设置面板"工具生态"页显示 Word / Excel / PowerPoint 三个工具
- 每个工具显示已连接 / 未安装状态
- 安装引导弹窗（开发期：sideload manifest 教程；正式期：AppSource 链接）

---

## 十三、不在本 spec 范围

- AppSource 上架流程
- 企业 MDM 批量部署
- Computer Use（桌面控制）

---

*本 spec 冻结后即为实现基准。功能变更需重新过 Challenge 流程。*
