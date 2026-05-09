# Primer: vscode-extension-e3m
# 引导问题表单：输入框展开态（静态版）

## 目标

在生成输入框右下角加"引导填写"按钮，点击展开 chip 卡片表单，填完自动收起并把答案拼成结构化 prompt 注入生成请求。老用户直接写 prompt 完全不受影响。

## Already Completed

- `electron/renderer/index.html`
  - 已新增 `#midtai-guide-form` 折叠表单与 `引导填写` 次级按钮
  - 已新增 `GUIDE_FORM_CONFIG`、`openGuideForm()`、`toggleGuideChip()`、`submitGuideForm()`
  - 已将 `userContext` 挂到 `designBridgeState`
  - 已把 `userContext` 串到 `requestDirections -> choose/skip -> generate` 整条链路
  - 已修正 `userContext` 生命周期，避免上一次引导表单内容污染下一次生成
- `electron/ElectronChatPanel.ts`
  - 已从 `message.userContext` 读取并透传给 design 生成链路
- `src/design/designEngine.ts`
  - `DesignGenerateOptions` 已支持 `userContext`
- `src/design/designPrompt.ts`
  - `buildKainClawDesignUserPrompt()` 已注入 `User context:` 段落
- 测试
  - `src/design/designPrompt.test.ts` 已覆盖 `userContext` prompt 注入
  - `electron/ElectronChatPanel.test.ts` 已覆盖 `design:generate` 透传 `userContext`

## 验证结果

- 已通过：
  - `npx vitest run src/design/designPrompt.test.ts electron/ElectronChatPanel.test.ts electron/rendererSettings.test.ts`
  - `npm run build:electron`
  - `electron/renderer/index.html` JS syntax check
  - UTF-8 decode check
- 当前仓库仍有与本任务无关的基线问题：
  - `npm run check` / `npm run build` 被现有 `NormalizedMessage` 相关类型错误阻塞
  - `npm test` 全量存在 `src/conversationRuntimeStateHost.test.ts` 的既有失败

## 依赖

vscode-extension-lb4（Skill 扩展）需先完成，因为表单字段按 skill 动态渲染。

## 当前状态

`electron/renderer/index.html` 第 1158 行附近：
```html
<div id="midtai-design-cta-wrap" class="midtai-cta-wrap">
  <button class="btn-red" onclick="generateDesignWorkbench()">生成设计</button>
</div>
```

`generateDesignWorkbench()` 约第 6291 行，读取 outputType + prompt，发送 `design:generate` IPC。

`src/design/designPrompt.ts` 的 `buildDesignSystemPrompt()` 接收 `options` 对象，目前没有 `userContext` 字段。

## 改动步骤

### Step 1：`electron/renderer/index.html` — 表单 UI

在 `#midtai-design-cta-wrap` 上方插入引导表单容器：

```html
<!-- 引导问题表单（默认收起） -->
<div id="midtai-guide-form" style="display:none;background:#fffdfb;border:1px solid #eadfd2;border-radius:10px;padding:12px 14px;margin-bottom:10px;font-size:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-weight:600;color:#292524">快速填写</span>
    <button type="button" onclick="closeGuideForm()" style="background:none;border:none;cursor:pointer;color:#a8a29e;font-size:14px;padding:0">×</button>
  </div>
  <div id="midtai-guide-fields"></div>
  <button class="btn-red" style="width:100%;margin-top:10px" onclick="submitGuideForm()">生成设计</button>
</div>
```

在 `#midtai-design-cta-wrap` 里，"生成设计"按钮旁加"引导填写"按钮：
```html
<div id="midtai-design-cta-wrap" class="midtai-cta-wrap" style="display:flex;gap:8px">
  <button class="btn-red" onclick="generateDesignWorkbench()">生成设计</button>
  <button type="button" onclick="openGuideForm()" style="background:#fff;border:1px solid #eadfd2;border-radius:8px;padding:0 14px;font-size:12px;color:#78716c;cursor:pointer;white-space:nowrap">引导填写</button>
</div>
```

### Step 2：`electron/renderer/index.html` — 表单数据 + 逻辑

在 JS 区域加表单配置数据：

```javascript
const GUIDE_FORM_CONFIG = {
  'prototype': [
    { id: 'theme', label: '内容方向', type: 'chips', options: ['产品展示', '企业官网', '个人主页', '活动页', '其他'] },
    { id: 'audience', label: '目标受众', type: 'text', placeholder: '例如：25-35岁职场女性' },
    { id: 'style', label: '视觉风格', type: 'chips', options: ['高级简约', '活泼年轻', '专业商务', '温暖亲切'] },
  ],
  'social-carousel': [
    { id: 'theme', label: '内容主题', type: 'chips', options: ['职场/效率', '生活方式', '美食/探店', '旅行', '美妆/穿搭', '其他'] },
    { id: 'keywords', label: '具体关键词', type: 'text', placeholder: '例如：早起习惯、咖啡馆推荐' },
    { id: 'audience', label: '目标读者', type: 'text', placeholder: '例如：职场新人、25-35岁女性' },
    { id: 'style', label: '内容风格', type: 'chips', options: ['干货实用', '温暖治愈', '活泼有趣', '高级感'] },
  ],
  'slide': [
    { id: 'topic', label: '演讲主题', type: 'text', placeholder: '例如：2024年Q3业务复盘' },
    { id: 'audience', label: '受众', type: 'chips', options: ['内部团队', '投资人', '客户', '公开演讲'] },
    { id: 'slides', label: '页数', type: 'chips', options: ['5页', '10页', '15页', '20页'] },
  ],
  'dashboard': [
    { id: 'domain', label: '业务领域', type: 'chips', options: ['电商', '金融', '运营', '产品', '人力'] },
    { id: 'metrics', label: '核心指标', type: 'text', placeholder: '例如：GMV、DAU、转化率' },
  ],
  'landing-page': [
    { id: 'product', label: '产品类型', type: 'chips', options: ['SaaS工具', '移动App', '实体产品', '服务', '课程'] },
    { id: 'audience', label: '目标用户', type: 'text', placeholder: '例如：中小企业主' },
    { id: 'cta', label: '核心行动', type: 'chips', options: ['免费试用', '立即购买', '预约演示', '下载App'] },
  ],
};
// 其他 skill fallback 到 prototype 配置
```

表单操作函数：

```javascript
function openGuideForm() {
  const outputType = document.getElementById('midtai-output-type')?.value || 'prototype';
  const config = GUIDE_FORM_CONFIG[outputType] || GUIDE_FORM_CONFIG['prototype'];
  const fieldsEl = document.getElementById('midtai-guide-fields');
  if (!fieldsEl) return;
  
  fieldsEl.innerHTML = config.map(field => {
    if (field.type === 'chips') {
      return `<div style="margin-bottom:10px">
        <div style="color:#78716c;margin-bottom:5px">${field.label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${field.options.map(opt => 
            `<button type="button" class="guide-chip" data-field="${field.id}" data-value="${opt}"
              onclick="toggleGuideChip(this)"
              style="padding:4px 10px;border-radius:20px;border:1px solid #eadfd2;background:#fff;font-size:11px;cursor:pointer;color:#57534e">${opt}</button>`
          ).join('')}
        </div>
      </div>`;
    } else {
      return `<div style="margin-bottom:10px">
        <div style="color:#78716c;margin-bottom:5px">${field.label}</div>
        <input type="text" data-field="${field.id}" placeholder="${field.placeholder || ''}"
          style="width:100%;box-sizing:border-box;border:1px solid #eadfd2;border-radius:6px;padding:6px 10px;font-size:12px;outline:none">
      </div>`;
    }
  }).join('');
  
  document.getElementById('midtai-guide-form').style.display = 'block';
}

function toggleGuideChip(btn) {
  const field = btn.dataset.field;
  const isActive = btn.style.background === 'rgb(201, 80, 46)';
  // 单选 chip：同 field 的其他 chip 取消选中
  document.querySelectorAll(`.guide-chip[data-field="${field}"]`).forEach(c => {
    c.style.background = '#fff';
    c.style.color = '#57534e';
    c.style.borderColor = '#eadfd2';
  });
  if (!isActive) {
    btn.style.background = '#c9502e';
    btn.style.color = '#fff';
    btn.style.borderColor = '#c9502e';
  }
}

function closeGuideForm() {
  document.getElementById('midtai-guide-form').style.display = 'none';
}

function submitGuideForm() {
  // 收集表单答案
  const answers = {};
  document.querySelectorAll('.guide-chip[style*="rgb(201, 80, 46)"]').forEach(chip => {
    answers[chip.dataset.field] = chip.dataset.value;
  });
  document.querySelectorAll('#midtai-guide-fields input[data-field]').forEach(input => {
    if (input.value.trim()) answers[input.dataset.field] = input.value.trim();
  });
  
  // 拼成 userContext 字符串
  const parts = Object.entries(answers).map(([k, v]) => `${k}: ${v}`);
  if (parts.length > 0) {
    const existing = document.getElementById('midtai-prompt-input')?.value || '';
    // 把 userContext 存到 designBridgeState，generateDesignWorkbench 读取
    designBridgeState.userContext = parts.join('；');
  }
  
  closeGuideForm();
  generateDesignWorkbench();
}
```

### Step 3：`generateDesignWorkbench()` — 透传 userContext

在 `generateDesignWorkbench()` 里，发送 `design:generate` IPC 时加入 `userContext`：

```javascript
send({
  type: 'design:generate',
  prompt: designBridgeState.prompt,
  outputType: designBridgeState.outputType,
  userContext: designBridgeState.userContext || '',  // 新增
  // ... 其他字段
});
```

发送后清空：`designBridgeState.userContext = '';`

### Step 4：`electron/ElectronChatPanel.ts` — 透传

在 `design:generate` handler 里，从 message 读取 `userContext` 并传给 `generateDesignWorkbench()`：

```typescript
const userContext = String(message.userContext ?? "");
// 传入 generateDesignWorkbench(... , { userContext })
```

### Step 5：`src/design/designPrompt.ts` — 注入 userContext

在 `buildDesignSystemPrompt()` 的 options 类型里加 `userContext?: string`，在 system prompt 末尾追加：

```typescript
if (options.userContext) {
  parts.push(`\n## User Context\n${options.userContext}`);
}
```

## 验收标准

1. Phase A 表单底部有"引导填写"按钮，点击展开表单卡片
2. 表单按当前选中的 outputType 动态渲染不同字段
3. chip 点击高亮（红色），再点取消
4. 点"生成设计"后表单收起，userContext 注入生成请求
5. 不点"引导填写"直接点"生成设计"，行为与之前完全一致
6. `npm run check` + `npm test` 通过

## 注意事项

- `designBridgeState.userContext` 每次生成后清空，避免污染下次生成
- chip 目前做单选（同 field 只能选一个），如需多选后续再改
- 表单 UI 颜色沿用现有 `#c9502e` 红色系 + `#eadfd2` 边框色
