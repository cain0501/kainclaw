# Computer Use + Browser Bridge 实现规范

## 定位

这份规范描述两套能力的完整实现逻辑：

1. **Computer Use Runtime** — 截图 → Claude 视觉分析 → OS 级鼠标/键盘控制（通用桌面操控）
2. **Browser Bridge** — Chrome Extension ↔ WebSocket ↔ KainClaw（真实浏览器控制，绕过风控）

两套能力可独立使用，也可组合使用。

---

## 目录结构

```
src/
  computerUse/
    screenCapture.ts        # 截图
    visionAnalyzer.ts       # Claude 视觉分析，返回动作指令
    mouseControl.ts         # OS 级鼠标键盘执行
    computerUseRuntime.ts   # 截图→分析→执行 循环编排
  browserBridge.ts          # KainClaw 侧 WebSocket 服务端 + 指令分发

extensions/
  browser-bridge/
    manifest.json           # Chrome Extension 清单
    background.js           # Extension 侧 WebSocket 客户端 + 指令路由
    content.js              # 页面内实际执行 DOM 操作
```

---

## 依赖

```json
{
  "dependencies": {
    "@nut-tree/nut-js": "^4.x",
    "screenshot-desktop": "^1.x",
    "sharp": "^0.x",
    "ws": "^8.x"
  }
}
```

- `@nut-tree/nut-js`：跨平台 OS 级鼠标/键盘控制（Windows/macOS/Linux）
- `screenshot-desktop`：截取主显示器截图为 Buffer
- `sharp`：图片压缩/转换，减少 API token 消耗
- `ws`：WebSocket 服务端

---

## 1. screenCapture.ts

```typescript
import screenshot from 'screenshot-desktop'
import sharp from 'sharp'

export interface ScreenshotResult {
  base64: string        // 压缩后的 base64，直接发给 Claude vision
  width: number
  height: number
}

export async function captureScreen(): Promise<ScreenshotResult> {
  const raw = await screenshot({ format: 'png' })

  // 压缩到 1280px 宽，减少 token 消耗
  const img = sharp(raw)
  const meta = await img.metadata()
  const width = meta.width ?? 1920
  const height = meta.height ?? 1080

  const targetWidth = Math.min(width, 1280)
  const scale = targetWidth / width
  const targetHeight = Math.round(height * scale)

  const compressed = await img
    .resize(targetWidth, targetHeight)
    .jpeg({ quality: 85 })
    .toBuffer()

  return {
    base64: compressed.toString('base64'),
    width: targetWidth,
    height: targetHeight,
  }
}
```

---

## 2. visionAnalyzer.ts

Claude Computer Use API 格式。分析截图，返回下一步动作。

```typescript
import Anthropic from '@anthropic-ai/sdk'

export type ComputerAction =
  | { type: 'screenshot' }
  | { type: 'mouse_move'; x: number; y: number }
  | { type: 'left_click'; x: number; y: number }
  | { type: 'right_click'; x: number; y: number }
  | { type: 'double_click'; x: number; y: number }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string }          // 例如 'Return', 'ctrl+c'
  | { type: 'scroll'; x: number; y: number; direction: 'up' | 'down'; amount: number }
  | { type: 'done'; result: string }       // 任务完成
  | { type: 'error'; message: string }     // 无法继续

export interface VisionAnalysisResult {
  action: ComputerAction
  reasoning: string   // Claude 的推理过程，用于 debug
}

const COMPUTER_TOOL: Anthropic.Tool = {
  name: 'computer',
  // @ts-ignore — Computer Use beta 工具格式
  type: 'computer_20241022',
  display_width_px: 1280,
  display_height_px: 720,
}

export async function analyzeScreenshot(
  client: Anthropic,
  task: string,
  screenshotBase64: string,
  width: number,
  height: number,
  history: Anthropic.MessageParam[] = []
): Promise<VisionAnalysisResult> {

  // 更新 COMPUTER_TOOL 的分辨率
  // @ts-ignore
  COMPUTER_TOOL.display_width_px = width
  // @ts-ignore
  COMPUTER_TOOL.display_height_px = height

  const messages: Anthropic.MessageParam[] = [
    ...history,
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          // @ts-ignore
          tool_use_id: 'initial_screenshot',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 },
            },
          ],
        },
        {
          type: 'text',
          text: history.length === 0
            ? `请帮我完成以下任务：${task}\n\n以上是当前屏幕截图，请决定下一步操作。`
            : '以上是执行上一步操作后的最新截图，请继续。',
        },
      ],
    },
  ]

  const response = await client.beta.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    tools: [COMPUTER_TOOL],
    messages,
    betas: ['computer-use-2024-10-22'],
  })

  // 解析 Claude 返回的 tool_use block
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'computer') {
      const input = block.input as Record<string, unknown>
      return {
        action: input as ComputerAction,
        reasoning: response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('\n'),
      }
    }
  }

  // Claude 没有调用工具，说明任务已完成或出错
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('\n')

  return {
    action: { type: 'done', result: text },
    reasoning: text,
  }
}
```

---

## 3. mouseControl.ts

OS 级鼠标键盘执行层，封装 `@nut-tree/nut-js`。

```typescript
import { mouse, keyboard, Point, Button, Key } from '@nut-tree/nut-js'
import type { ComputerAction } from './visionAnalyzer'

// 截图宽度与实际屏幕宽度的缩放比（截图压缩到了 1280px）
let scaleX = 1
let scaleY = 1

export function setDisplayScale(
  screenshotWidth: number,
  screenshotHeight: number,
  actualWidth: number,
  actualHeight: number
) {
  scaleX = actualWidth / screenshotWidth
  scaleY = actualHeight / screenshotHeight
}

export async function executeAction(action: ComputerAction): Promise<void> {
  switch (action.type) {
    case 'mouse_move': {
      const p = new Point(action.x * scaleX, action.y * scaleY)
      await mouse.move([p])
      break
    }
    case 'left_click': {
      const p = new Point(action.x * scaleX, action.y * scaleY)
      await mouse.move([p])
      await mouse.click(Button.LEFT)
      break
    }
    case 'right_click': {
      const p = new Point(action.x * scaleX, action.y * scaleY)
      await mouse.move([p])
      await mouse.click(Button.RIGHT)
      break
    }
    case 'double_click': {
      const p = new Point(action.x * scaleX, action.y * scaleY)
      await mouse.move([p])
      await mouse.doubleClick(Button.LEFT)
      break
    }
    case 'type': {
      await keyboard.type(action.text)
      break
    }
    case 'key': {
      // 例如 'Return', 'ctrl+c', 'Escape'
      const keys = parseKeyCombo(action.key)
      await keyboard.pressKey(...keys)
      await keyboard.releaseKey(...keys)
      break
    }
    case 'scroll': {
      const p = new Point(action.x * scaleX, action.y * scaleY)
      await mouse.move([p])
      if (action.direction === 'down') {
        await mouse.scrollDown(action.amount)
      } else {
        await mouse.scrollUp(action.amount)
      }
      break
    }
    case 'screenshot':
    case 'done':
    case 'error':
      // 这三种不需要执行 OS 操作
      break
  }
}

function parseKeyCombo(keyStr: string): Key[] {
  const parts = keyStr.toLowerCase().split('+')
  return parts.map(p => {
    switch (p) {
      case 'ctrl': case 'control': return Key.LeftControl
      case 'alt': return Key.LeftAlt
      case 'shift': return Key.LeftShift
      case 'meta': case 'cmd': return Key.LeftSuper
      case 'return': case 'enter': return Key.Return
      case 'escape': case 'esc': return Key.Escape
      case 'tab': return Key.Tab
      case 'backspace': return Key.Backspace
      case 'delete': return Key.Delete
      case 'space': return Key.Space
      default: return Key[p.toUpperCase() as keyof typeof Key] ?? Key.Space
    }
  })
}
```

---

## 4. computerUseRuntime.ts

截图 → 分析 → 执行 的完整循环编排。

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { captureScreen } from './screenCapture'
import { analyzeScreenshot, VisionAnalysisResult } from './visionAnalyzer'
import { executeAction, setDisplayScale } from './mouseControl'
import { getScreenSize } from '../utils/display'  // 获取真实屏幕分辨率

export interface ComputerUseOptions {
  maxIterations?: number          // 最大循环次数，默认 20
  delayBetweenActions?: number    // 每次操作后等待 ms，默认 500
  onProgress?: (step: number, reasoning: string) => void
}

export interface ComputerUseResult {
  success: boolean
  result: string
  steps: number
}

export async function runComputerUseTask(
  client: Anthropic,
  task: string,
  options: ComputerUseOptions = {}
): Promise<ComputerUseResult> {
  const maxIterations = options.maxIterations ?? 20
  const delay = options.delayBetweenActions ?? 500

  // 获取真实屏幕分辨率，用于坐标缩放
  const actualScreen = await getScreenSize()
  const history: Anthropic.MessageParam[] = []

  for (let step = 0; step < maxIterations; step++) {
    // 1. 截图
    const screenshot = await captureScreen()

    // 2. 设置坐标缩放比
    setDisplayScale(
      screenshot.width,
      screenshot.height,
      actualScreen.width,
      actualScreen.height
    )

    // 3. 发给 Claude 分析
    const analysis = await analyzeScreenshot(
      client,
      task,
      screenshot.base64,
      screenshot.width,
      screenshot.height,
      history
    )

    options.onProgress?.(step + 1, analysis.reasoning)

    // 4. 任务完成或出错
    if (analysis.action.type === 'done') {
      return { success: true, result: analysis.action.result, steps: step + 1 }
    }
    if (analysis.action.type === 'error') {
      return { success: false, result: analysis.action.message, steps: step + 1 }
    }

    // 5. 执行动作
    await executeAction(analysis.action)

    // 6. 等待页面响应
    await sleep(delay)

    // 7. 把这一步的截图和动作追加到 history，让下一轮 Claude 有上下文
    history.push({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: `step_${step}`,
          name: 'computer',
          input: analysis.action,
        },
      ],
    })
  }

  return { success: false, result: '已达到最大步骤数，任务未完成', steps: maxIterations }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

## 5. browserBridge.ts

KainClaw 侧 WebSocket 服务端。Chrome Extension 连进来后，KainClaw 可以向真实浏览器发送指令。

```typescript
import { WebSocketServer, WebSocket } from 'ws'

export type BridgeCommand =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector?: string; x?: number; y?: number }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'read'; selector?: string }           // 读取页面文本
  | { type: 'evaluate'; code: string }            // 执行任意 JS
  | { type: 'screenshot' }                        // 截取页面截图（base64）
  | { type: 'scroll'; direction: 'up' | 'down'; amount: number }
  | { type: 'wait_for'; selector: string; timeout?: number }

export interface BridgeResult {
  success: boolean
  data?: unknown
  error?: string
}

const PORT = 52357  // 固定端口，Extension 侧硬编码一致

export class BrowserBridge {
  private wss: WebSocketServer | null = null
  private client: WebSocket | null = null
  private pendingCallbacks = new Map<string, (result: BridgeResult) => void>()

  start(): void {
    this.wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' })
    this.wss.on('connection', (ws) => {
      this.client = ws
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { id: string; result: BridgeResult }
          const cb = this.pendingCallbacks.get(msg.id)
          if (cb) {
            cb(msg.result)
            this.pendingCallbacks.delete(msg.id)
          }
        } catch {}
      })
      ws.on('close', () => { this.client = null })
    })
  }

  stop(): void {
    this.wss?.close()
    this.wss = null
    this.client = null
  }

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN
  }

  async execute(command: BridgeCommand, timeout = 10000): Promise<BridgeResult> {
    if (!this.isConnected) {
      return { success: false, error: 'Browser extension not connected' }
    }

    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id)
        resolve({ success: false, error: 'Timeout' })
      }, timeout)

      this.pendingCallbacks.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })

      this.client!.send(JSON.stringify({ id, command }))
    })
  }
}

export const browserBridge = new BrowserBridge()
```

---

## 6. Chrome Extension

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "KainClaw Browser Bridge",
  "version": "1.0.0",
  "description": "Connects KainClaw to your real browser",
  "permissions": ["activeTab", "scripting", "tabs"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "KainClaw Bridge"
  }
}
```

### background.js

```javascript
const PORT = 52357
let ws = null
let reconnectTimer = null

function connect() {
  ws = new WebSocket(`ws://127.0.0.1:${PORT}`)

  ws.onopen = () => {
    console.log('[KainClaw] Bridge connected')
    clearTimeout(reconnectTimer)
  }

  ws.onmessage = async (event) => {
    const { id, command } = JSON.parse(event.data)
    const result = await handleCommand(command)
    ws.send(JSON.stringify({ id, result }))
  }

  ws.onclose = () => {
    console.log('[KainClaw] Bridge disconnected, retrying...')
    reconnectTimer = setTimeout(connect, 3000)
  }
}

async function handleCommand(command) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return { success: false, error: 'No active tab' }

    switch (command.type) {
      case 'navigate':
        await chrome.tabs.update(tab.id, { url: command.url })
        // 等待页面加载完成
        await waitForTabLoad(tab.id)
        return { success: true }

      case 'screenshot': {
        const dataUrl = await chrome.tabs.captureVisibleTab()
        return { success: true, data: dataUrl }
      }

      // click / fill / read / evaluate / scroll / wait_for
      // 通过 content script 注入执行
      default: {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: executeInPage,
          args: [command],
        })
        return results[0]?.result ?? { success: false, error: 'Script failed' }
      }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(resolve, 10000)  // 最多等 10s
  })
}

connect()
```

### content.js（注入到页面内执行）

```javascript
// 这个函数会被 executeScript 注入到页面执行
function executeInPage(command) {
  try {
    switch (command.type) {
      case 'click': {
        const el = command.selector
          ? document.querySelector(command.selector)
          : document.elementFromPoint(command.x, command.y)
        if (!el) return { success: false, error: `Element not found: ${command.selector}` }
        el.click()
        return { success: true }
      }

      case 'fill': {
        const el = document.querySelector(command.selector)
        if (!el) return { success: false, error: `Element not found: ${command.selector}` }
        // 兼容 React 受控组件
        const nativeInput = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )
        nativeInput?.set?.call(el, command.value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true }
      }

      case 'read': {
        const el = command.selector
          ? document.querySelector(command.selector)
          : document.body
        return { success: true, data: el?.innerText ?? '' }
      }

      case 'evaluate': {
        // eslint-disable-next-line no-eval
        const result = eval(command.code)
        return { success: true, data: result }
      }

      case 'scroll': {
        const amount = command.amount * 100
        window.scrollBy(0, command.direction === 'down' ? amount : -amount)
        return { success: true }
      }

      case 'wait_for': {
        // 轮询等待元素出现
        const timeout = command.timeout ?? 5000
        const start = Date.now()
        return new Promise((resolve) => {
          const check = () => {
            if (document.querySelector(command.selector)) {
              resolve({ success: true })
            } else if (Date.now() - start > timeout) {
              resolve({ success: false, error: 'Element timeout' })
            } else {
              setTimeout(check, 200)
            }
          }
          check()
        })
      }

      default:
        return { success: false, error: `Unknown command: ${command.type}` }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
```

---

## 7. 决策路由（集成到 toolRuntime.ts）

```typescript
// 在 toolRuntime.ts 里新增 ComputerUseTool 和 BrowserTool

// ComputerUseTool — 通用桌面操控（OS 级）
export const ComputerUseTool = {
  name: 'ComputerUse',
  description: '控制桌面执行任意 GUI 任务。截图 → AI 分析 → 执行鼠标键盘操作。',
  inputSchema: {
    task: { type: 'string', description: '用自然语言描述要完成的任务' },
    maxSteps: { type: 'number', description: '最大步骤数，默认 20' },
  },
  async execute({ task, maxSteps }: { task: string; maxSteps?: number }) {
    const { runComputerUseTask } = await import('./computerUse/computerUseRuntime')
    return runComputerUseTask(anthropicClient, task, { maxIterations: maxSteps })
  }
}

// BrowserTool — 真实浏览器控制（通过 Chrome Extension）
export const BrowserTool = {
  name: 'BrowserControl',
  description: '控制用户已登录的真实浏览器执行操作。不会触发网站风控。',
  inputSchema: {
    command: { type: 'object', description: 'BridgeCommand 对象' },
  },
  async execute({ command }: { command: BridgeCommand }) {
    if (!browserBridge.isConnected) {
      return { success: false, error: '请先安装并启用 KainClaw Browser Bridge 扩展' }
    }
    return browserBridge.execute(command)
  }
}
```

---

## 8. 对 official-gap-analysis.md 的影响

实现完成后，以下两条状态从「未实现」改为「部分实现」：

| 能力 | 新状态 | 关键文件 |
|---|---|---|
| Computer Use | 部分实现 | `src/computerUse/*` |
| Browser Bridge（真实设备控制） | 部分实现 | `src/browserBridge.ts` + `extensions/browser-bridge/` |

---

## 实现顺序建议

1. `screenCapture.ts` + `mouseControl.ts`（最低依赖，先跑通 OS 控制）
2. `visionAnalyzer.ts`（接 Claude API，验证视觉分析能力）
3. `computerUseRuntime.ts`（串联成完整循环，写集成测试）
4. `browserBridge.ts` WebSocket 服务（先验证 KainClaw 侧逻辑）
5. Chrome Extension（background + content，在浏览器里手动测试）
6. 联调：KainClaw ↔ Extension ↔ 真实网页

每一步都要有单独的测试文件，不要一次性全串联再测。
