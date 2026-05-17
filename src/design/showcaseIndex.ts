import type { DesignOutputType } from "./designPrompt";

export type DesignDirectionPreview = {
  kind: "gradient";
  value: string;
};

export type DesignDirectionSpec = {
  palette: {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    border: string;
    accent: string;
  };
  displayFont: string;
  bodyFont: string;
  monoFont?: string;
  posture: string[];
};

export type DesignDirectionSuggestion = {
  id: string;
  label: string;
  summary: string;
  stylePrompt: string;
  preview: DesignDirectionPreview;
  spec?: DesignDirectionSpec;
};

const SCENARIO_KEYWORDS = [
  "landing",
  "homepage",
  "dashboard",
  "app",
  "mobile",
  "slide",
  "deck",
  "infographic",
  "poster",
  "cover",
  "hero",
  "官网",
  "首页",
  "仪表盘",
  "应用",
  "海报",
  "封面",
  "原型",
  "幻灯片",
  "信息图",
  "页面",
  "产品",
];

const DIRECTIONS: Record<DesignOutputType, DesignDirectionSuggestion[]> = {
  prototype: [
    {
      id: "information-architecture",
      label: "信息建筑",
      summary: "高对比、瑞士网格、强排版层级，适合产品首页和 B2B 原型。",
      stylePrompt:
        "information architecture, swiss grid, strong editorial hierarchy, black white with restrained red accent, premium product prototype",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #111111 0%, #f5f1eb 55%, #e63946 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(99% 0.002 240)",
          surface: "oklch(100% 0 0)",
          fg:      "oklch(18% 0.012 250)",
          muted:   "oklch(54% 0.012 250)",
          border:  "oklch(92% 0.005 250)",
          accent:  "oklch(56% 0.18 255)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        posture: [
          "严格 8px 倍数间距，网格对齐优先于视觉装饰",
          "hairline 边框（1px），不用阴影，功能区无圆角",
          "标题字重 700+，正文 400，层级落差要明显",
          "强调色只用于主 CTA 和关键数据，其余元素全灰",
          "禁止装饰性插图，用真实截图或几何占位块",
          "中文标题不超过 16 字，英文副标题可稍长",
        ],
      },
    },
    {
      id: "minimal-luxury",
      label: "极简奢侈",
      summary: "大留白、细字重、暖金点缀，适合高端品牌和创始人产品。",
      stylePrompt:
        "minimal luxury editorial, warm ivory background, delicate serif display, subtle gold accent, quiet premium spacing",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #f7f1e8 0%, #ffffff 58%, #d4a574 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(97% 0.018 70)",
          surface: "oklch(99% 0.008 70)",
          fg:      "oklch(22% 0.02 50)",
          muted:   "oklch(50% 0.018 50)",
          border:  "oklch(90% 0.014 70)",
          accent:  "oklch(62% 0.12 30)",
        },
        displayFont: "'Noto Serif SC', 'Source Han Serif CN', 'Songti SC', Georgia, serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "衬线大标题，无衬线正文，字重对比强（display 700，body 400）",
          "内容区不超过 760px，水平居中，大量负空间",
          "强调色克制：只在一处装饰性使用，不多于两处",
          "无圆角卡片，用边框线或背景色差做分区",
          "图片只用一张主图，全宽或全出血，不堆叠多图",
          "禁止渐变背景，禁止阴影，用纸张质感的米白做底",
        ],
      },
    },
    {
      id: "eastern-minimal",
      label: "东方极简",
      summary: "自然米灰、软科技、细节克制，适合文化感与未来感混合的产品。",
      stylePrompt:
        "eastern minimal soft-tech, beige and stone palette, calm whitespace, organic geometry, subtle futuristic interface",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #ece4d8 0%, #c9d1c8 52%, #6f7d72 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(96% 0.014 85)",
          surface: "oklch(98% 0.008 85)",
          fg:      "oklch(25% 0.02 60)",
          muted:   "oklch(52% 0.016 65)",
          border:  "oklch(88% 0.014 80)",
          accent:  "oklch(52% 0.12 145)",
        },
        displayFont: "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        bodyFont:    "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "自然米灰主色，苔藓绿/竹绿强调，拒绝鲜艳色彩",
          "留白大于内容，模块间距 64px 以上",
          "圆形或正方形几何占位，不用圆角矩形",
          "禁止阴影和渐变，用色块明度差做层级",
          "文案精简：标题不超过 14 字，副标题不超过 30 字",
          "横向留白优先于竖向堆叠",
        ],
      },
    },
    {
      id: "editorial-monocle",
      label: "编辑杂志",
      summary: "印刷杂志感，大衬线标题，适合内容型产品和媒体品牌。",
      stylePrompt:
        "editorial magazine, generous whitespace, large serif headlines, off-white paper, warm rust accent, print-inspired layout",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #f5f0e8 0%, #ffffff 55%, #c0392b 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(97% 0.012 80)",
          surface: "oklch(99% 0.005 80)",
          fg:      "oklch(20% 0.02 60)",
          muted:   "oklch(48% 0.015 60)",
          border:  "oklch(89% 0.012 80)",
          accent:  "oklch(58% 0.16 35)",
        },
        displayFont: "'Noto Serif SC', 'Source Han Serif CN', Georgia, serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "衬线大标题，无衬线正文，字重对比强",
          "大量负空间，内容区不超过 760px 水平居中",
          "强调色只在一处装饰性使用",
          "无圆角卡片，用边框线做分区",
          "禁止渐变背景，用纸张质感米白做底",
        ],
      },
    },
    {
      id: "brutalist-experimental",
      label: "实验前锋",
      summary: "高对比强 accent，适合主题海报和创意工作室展示。",
      stylePrompt:
        "brutalist experimental, high contrast, bold asymmetric layout, strong accent color, raw typographic energy, poster attitude",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #0a0a0a 0%, #f5f5f5 50%, #ff3b00 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(10% 0.005 0)",
          surface: "oklch(15% 0.005 0)",
          fg:      "oklch(96% 0.005 0)",
          muted:   "oklch(60% 0.005 0)",
          border:  "oklch(25% 0.005 0)",
          accent:  "oklch(62% 0.22 25)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "超大字号标题（≥72px），字重 900",
          "非对称布局，打破网格",
          "强调色大面积使用，不克制",
          "极少圆角，硬边框",
          "负空间和正空间强烈对比",
        ],
      },
    },
  ],
  slide: [
    {
      id: "pitch-editorial",
      label: "编辑式提案",
      summary: "强封面感、标题主导、适合 pitch deck 与产品发布。",
      stylePrompt:
        "editorial pitch deck, strong cover page, serif display headlines, cinematic whitespace, premium keynote layout",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #18181b 0%, #f4efe8 60%, #b86f52 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(15% 0.01 20)",
          surface: "oklch(98% 0.008 70)",
          fg:      "oklch(18% 0.02 40)",
          muted:   "oklch(50% 0.015 45)",
          border:  "oklch(87% 0.015 65)",
          accent:  "oklch(62% 0.13 40)",
        },
        displayFont: "'Noto Serif SC', 'Source Han Serif CN', Georgia, serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "每页只保留一个大标题和一个重点数据",
          "封面感优先，单页层级不超过三层",
          "跨页保持统一页边距和页码节奏",
          "配图宁少勿多，用一张主图撑起气氛",
          "强调色只用于目录页和 CTA 页",
        ],
      },
    },
    {
      id: "data-modernist",
      label: "现代数据派",
      summary: "网格感强、数字主导，适合指标、路演、季度汇报。",
      stylePrompt:
        "modernist data presentation, swiss grid, sharp chart framing, restrained blue-gray accents, presentation not webpage",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #1f2937 0%, #dbe6f0 55%, #4f83cc 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(14% 0.018 255)",
          surface: "oklch(20% 0.015 255)",
          fg:      "oklch(95% 0.008 240)",
          muted:   "oklch(62% 0.015 250)",
          border:  "oklch(30% 0.018 255)",
          accent:  "oklch(68% 0.18 145)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        monoFont:    "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
        posture: [
          "深色背景，数据密集，信息优先于装饰",
          "等宽数字（tabular-nums），所有数据统计用 mono 字体",
          "状态 pill 用克制的半透明背景色",
          "hairline 边框做数据区分隔，不用阴影",
          "强调色只用于图表高亮、正增长/核心指标",
          "避免大图、英雄区、营销文案——展示产品数据本身",
        ],
      },
    },
    {
      id: "motion-poetry",
      label: "运动诗学",
      summary: "流动感和节奏感更强，适合发布会开场和品牌叙事页。",
      stylePrompt:
        "motion poetry presentation, fluid composition, kinetic typography feeling, luminous gradients, cinematic transition-ready slides",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #2a1f4f 0%, #ff8ca8 50%, #ffd0b5 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(19% 0.06 310)",
          surface: "oklch(26% 0.05 305)",
          fg:      "oklch(96% 0.01 20)",
          muted:   "oklch(72% 0.04 15)",
          border:  "oklch(38% 0.04 300)",
          accent:  "oklch(74% 0.14 40)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "版面应有舞台节奏感，允许大斜切和穿插标题",
          "大字与小字强对比，字幕可沿边布局",
          "每页只保留一条主叙事动线",
          "渐变只用于大背景，不在卡片上重复",
          "动画页的留白要比静态页更多",
        ],
      },
    },
    {
      id: "boardroom-clarity",
      label: "董事会清晰",
      summary: "高可信商务呈现，适合管理层汇报与战略更新。",
      stylePrompt:
        "boardroom clarity, understated business presentation, disciplined spacing, clear executive hierarchy, muted graphite and sand accents",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #f4f1eb 0%, #ffffff 48%, #8c7462 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(96% 0.008 80)",
          surface: "oklch(99% 0.004 80)",
          fg:      "oklch(24% 0.01 60)",
          muted:   "oklch(54% 0.01 60)",
          border:  "oklch(89% 0.008 80)",
          accent:  "oklch(56% 0.06 55)",
        },
        displayFont: "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        bodyFont:    "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "标题短促有结论感，副标题承担解释",
          "图表、表格、结论卡比例稳定，不做跳跃构图",
          "每页保留一个董事会级 takeaway",
          "配色克制，以石墨灰和沙色为主",
          "边框和分割线比阴影更重要",
        ],
      },
    },
  ],
  infographic: [
    {
      id: "signal-board",
      label: "信号板",
      summary: "信息密度高但分区清楚，适合流程、对比、结构化信息图。",
      stylePrompt:
        "signal-board infographic, structured modules, high information density with clean grouping, editorial diagram style",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #131313 0%, #efefef 60%, #ef4444 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(96% 0.004 240)",
          surface: "oklch(100% 0 0)",
          fg:      "oklch(18% 0.01 250)",
          muted:   "oklch(50% 0.01 250)",
          border:  "oklch(88% 0.005 250)",
          accent:  "oklch(58% 0.18 28)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "每个模块必须自成单元，边界清晰",
          "允许较高信息密度，但要保证扫描顺序明确",
          "图标、数字、标签三者形成固定模板",
          "强调色只给关键节点或警示信息",
          "每个信息块都要有足够内边距",
        ],
      },
    },
    {
      id: "calm-systems",
      label: "宁静系统感",
      summary: "米灰+青绿系统感，适合解释型信息图和年度总结视觉。",
      stylePrompt:
        "calm systems infographic, muted sand and sage palette, neat data storytelling, elegant labels and spacing",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #ede7db 0%, #d6dfd8 58%, #7ca08a 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(95% 0.012 85)",
          surface: "oklch(98% 0.008 85)",
          fg:      "oklch(24% 0.015 70)",
          muted:   "oklch(52% 0.012 70)",
          border:  "oklch(87% 0.012 80)",
          accent:  "oklch(56% 0.09 155)",
        },
        displayFont: "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        bodyFont:    "'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "卡片和流程线应柔和但保持清晰边界",
          "使用大号留白把复杂信息拆成小段",
          "说明文案保持 1-2 句，不堆术语",
          "主视觉颜色来自灰米和鼠尾草绿",
          "统计数字应稳定对齐，不做夸张特效",
        ],
      },
    },
    {
      id: "bold-experimental",
      label: "实验前锋",
      summary: "构图更大胆，适合主题海报式信息图和创意传播物料。",
      stylePrompt:
        "bold experimental infographic, asymmetrical composition, poster-like information design, texture and attitude",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #22181c 0%, #ffb36b 45%, #ff6a89 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(16% 0.03 10)",
          surface: "oklch(96% 0.01 80)",
          fg:      "oklch(18% 0.015 20)",
          muted:   "oklch(52% 0.02 20)",
          border:  "oklch(88% 0.012 75)",
          accent:  "oklch(70% 0.16 35)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "信息块可错位，但必须存在强起点和强终点",
          "主标题应该像海报，不像报告",
          "装饰纹理只作为背景层，不可遮挡数据",
          "每组数据只突出一个最大值",
          "边角留出足够呼吸空间，避免边缘拥挤",
        ],
      },
    },
    {
      id: "annual-atlas",
      label: "年度图谱",
      summary: "适合年报/年度回顾，强调时间轴和里程碑。",
      stylePrompt:
        "annual atlas infographic, timeline-led storytelling, milestone markers, premium archival palette, calm structured year-in-review",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #f2ece5 0%, #ffffff 50%, #8da3b8 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(96% 0.01 75)",
          surface: "oklch(99% 0.004 75)",
          fg:      "oklch(24% 0.01 60)",
          muted:   "oklch(56% 0.01 60)",
          border:  "oklch(89% 0.008 75)",
          accent:  "oklch(64% 0.08 245)",
        },
        displayFont: "'Noto Serif SC', 'Source Han Serif CN', Georgia, serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "时间轴是第一视觉层级，其余信息围绕它排布",
          "里程碑卡片尺寸统一，避免形态噪音",
          "每个年份或阶段只保留一条关键信息",
          "强调色用于定位点和关键数字",
          "让读者从上到下或从左到右一笔读完",
        ],
      },
    },
  ],
  animation: [
    {
      id: "motion-poetry",
      label: "运动诗学",
      summary: "流体节奏和发光色带，适合动态叙事和开场动画感页面。",
      stylePrompt:
        "motion poetry animated prototype, fluid rhythm, layered gradients, kinetic composition, motion-first atmosphere",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #30204d 0%, #7c5cff 42%, #ff8ba7 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(18% 0.05 300)",
          surface: "oklch(24% 0.05 295)",
          fg:      "oklch(96% 0.01 20)",
          muted:   "oklch(72% 0.04 5)",
          border:  "oklch(34% 0.05 300)",
          accent:  "oklch(74% 0.18 20)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "每一屏都像动画关键帧，构图有明显运动方向",
          "层叠渐变只保留 1 个主背景，不要四处发光",
          "标题沿运动方向排布，可错位",
          "按钮和功能元素要比背景更稳定克制",
          "留出足够空间给未来动画，不把画面塞满",
        ],
      },
    },
    {
      id: "signal-board",
      label: "信号板",
      summary: "模块化强、节奏清楚，适合动效型讲解页面与步骤型演示。",
      stylePrompt:
        "signal-board animated interface, modular timing, precise structure, dynamic explanatory layout",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #141414 0%, #d1d5db 58%, #60a5fa 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(12% 0.01 250)",
          surface: "oklch(18% 0.012 250)",
          fg:      "oklch(95% 0.008 240)",
          muted:   "oklch(62% 0.01 245)",
          border:  "oklch(30% 0.012 250)",
          accent:  "oklch(70% 0.12 235)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "模块必须像时间轴节点一样排布，节奏均匀",
          "功能块之间的距离比尺寸更重要",
          "强调色用于当前步骤和进度提示",
          "动画感来自排布和顺序，不靠重阴影",
          "每屏只解释一个动作或一个状态切换",
        ],
      },
    },
    {
      id: "bold-experimental",
      label: "实验前锋",
      summary: "更有舞台感和冲击力，适合营销向动态演示。",
      stylePrompt:
        "bold experimental motion design, poster energy, asymmetrical rhythm, saturated highlight accents",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #200f18 0%, #ff7a59 48%, #ffd166 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(14% 0.03 10)",
          surface: "oklch(20% 0.025 10)",
          fg:      "oklch(96% 0.008 40)",
          muted:   "oklch(66% 0.03 25)",
          border:  "oklch(28% 0.03 15)",
          accent:  "oklch(72% 0.18 35)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "画面重心可偏移，保留舞台海报式冲击力",
          "用粗大标题和短句制造节奏",
          "强调色出现时必须形成记忆点",
          "交互组件需要强边界感，不能被背景吞掉",
          "让画面看起来准备进入下一帧，而不是静止海报",
        ],
      },
    },
    {
      id: "glass-signal",
      label: "玻璃信号",
      summary: "透明层叠但仍强调结构，适合未来感产品讲解动画。",
      stylePrompt:
        "glass signal motion UI, translucent layers, precise spacing, future-facing explanation layout, calm luminous controls",
      preview: {
        kind: "gradient",
        value:
          "linear-gradient(135deg, #09131c 0%, #dae7f2 52%, #7ed9d1 100%)",
      },
      spec: {
        palette: {
          bg:      "oklch(14% 0.018 235)",
          surface: "oklch(22% 0.02 230)",
          fg:      "oklch(96% 0.006 210)",
          muted:   "oklch(68% 0.015 215)",
          border:  "oklch(32% 0.018 225)",
          accent:  "oklch(78% 0.11 190)",
        },
        displayFont: "system-ui, -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
        bodyFont:    "system-ui, -apple-system, 'PingFang SC', sans-serif",
        posture: [
          "透明层数不超过两层，避免糊成一团",
          "信息卡片有明确轮廓和高亮边缘",
          "强调色用于 hover / active / progress 等状态",
          "每组内容间保留明显气泡间距",
          "未来感来自材质和秩序，不来自炫技",
        ],
      },
    },
  ],
  "social-carousel": [],
  email: [],
  "mobile-app": [],
  "magazine-poster": [],
  dashboard: [],
  "doc-report": [],
  "pricing-page": [],
  "landing-page": [],
};

DIRECTIONS["social-carousel"] = DIRECTIONS.prototype;
DIRECTIONS.email = DIRECTIONS.prototype;
DIRECTIONS["mobile-app"] = DIRECTIONS.prototype;
DIRECTIONS["magazine-poster"] = DIRECTIONS.prototype;
DIRECTIONS.dashboard = DIRECTIONS.prototype;
DIRECTIONS["doc-report"] = DIRECTIONS.prototype;
DIRECTIONS["pricing-page"] = DIRECTIONS.prototype;
DIRECTIONS["landing-page"] = DIRECTIONS.prototype;

export function isAmbiguousDesignPrompt(prompt: string): boolean {
  const trimmed = prompt.trim().toLowerCase();
  if (trimmed.length < 10) {
    return true;
  }

  return !SCENARIO_KEYWORDS.some(keyword => trimmed.includes(keyword));
}

export function getDesignDirectionSuggestions(
  outputType: DesignOutputType,
): DesignDirectionSuggestion[] {
  return DIRECTIONS[outputType] ?? DIRECTIONS.prototype;
}

export function getDirectionByStylePrompt(stylePrompt: string): DesignDirectionSuggestion | undefined {
  if (!stylePrompt) return undefined;
  const trimmed = stylePrompt.trim();
  for (const dirs of Object.values(DIRECTIONS)) {
    const found = dirs.find(d => d.stylePrompt === trimmed || d.id === trimmed);
    if (found) return found;
  }
  return undefined;
}

export function renderDirectionSpec(direction: DesignDirectionSuggestion): string {
  if (!direction.spec) return "";
  const { palette, displayFont, bodyFont, monoFont, posture } = direction.spec;
  return [
    `## Visual direction: ${direction.label}`,
    "",
    "Bind these CSS values into the HTML :root block verbatim. Do not improvise palette or fonts.",
    "",
    "```css",
    ":root {",
    `  --bg:      ${palette.bg};`,
    `  --surface: ${palette.surface};`,
    `  --fg:      ${palette.fg};`,
    `  --muted:   ${palette.muted};`,
    `  --border:  ${palette.border};`,
    `  --accent:  ${palette.accent};`,
    "",
    `  --font-display: ${displayFont};`,
    `  --font-body:    ${bodyFont};`,
    ...(monoFont ? [`  --font-mono:    ${monoFont};`] : []),
    "}",
    "```",
    "",
    "Layout posture (apply these in every structural decision):",
    ...posture.map(p => `- ${p}`),
  ].join("\n");
}

export const CHINESE_DIRECTIONS: DesignDirectionSuggestion[] = [
  {
    id: "lifestyle-redbook",
    label: "暖调生活",
    summary: "温暖编辑感，圆润卡片，适合生活方式、种草、内容社区场景。",
    stylePrompt:
      "warm lifestyle editorial, coral red accent, rounded cards, content community",
    preview: {
      kind: "gradient",
      value: "linear-gradient(135deg, #f6f1ea 0%, #f0d9cc 60%, #c45c3a 100%)",
    },
    spec: {
      palette: {
        bg: "oklch(97% 0.012 58)",
        surface: "oklch(95% 0.018 48)",
        fg: "oklch(20% 0.02 40)",
        muted: "oklch(55% 0.015 50)",
        border: "oklch(88% 0.022 55)",
        accent: "oklch(55% 0.20 20)",
      },
      displayFont: "'Noto Serif SC', 'Source Han Serif CN', Georgia, serif",
      bodyFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      posture: [
        "border-radius: 16-24px on cards and buttons",
        "soft box-shadow: 0 2px 12px oklch(0% 0 0 / 8%)",
        "accent used exactly once - primary CTA only",
        "generous whitespace; section padding >= 80px",
        "image-to-text ratio: prioritize imagery",
      ],
    },
  },
  {
    id: "streetwear-dark",
    label: "潮流暗黑",
    summary: "高反差黑底，荧光薄荷绿点缀，适合潮牌、球鞋、收藏品场景。",
    stylePrompt:
      "dark streetwear, high contrast, fluorescent teal accent, sneaker resale",
    preview: {
      kind: "gradient",
      value: "linear-gradient(135deg, #1a1a22 0%, #111118 60%, #00e5a0 100%)",
    },
    spec: {
      palette: {
        bg: "oklch(12% 0.008 260)",
        surface: "oklch(18% 0.010 260)",
        fg: "oklch(95% 0.005 80)",
        muted: "oklch(50% 0.010 260)",
        border: "oklch(28% 0.015 260)",
        accent: "oklch(72% 0.20 165)",
      },
      displayFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      bodyFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      posture: [
        "border-radius: 0-6px; sharp corners only",
        "no decorative shadows; high contrast borders only",
        "accent used exactly once - price tag or badge highlight",
        "font-weight: 700-900 for all headings",
        "dense product grid; compact row spacing",
        "no warm colors anywhere on the page",
      ],
    },
  },
  {
    id: "tech-flagship",
    label: "科技旗舰",
    summary: "纯白底，橙色点缀，产品图居中全宽，适合数码、家电、旗舰产品官网。",
    stylePrompt:
      "tech flagship product page, pure white, orange accent, full-bleed product photography",
    preview: {
      kind: "gradient",
      value: "linear-gradient(135deg, #ffffff 0%, #f5f5f7 60%, #ff6900 100%)",
    },
    spec: {
      palette: {
        bg: "oklch(99% 0.003 80)",
        surface: "oklch(97% 0.005 80)",
        fg: "oklch(15% 0.010 260)",
        muted: "oklch(55% 0.008 260)",
        border: "oklch(90% 0.008 260)",
        accent: "oklch(64% 0.19 44)",
      },
      displayFont: "'MiSans', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      bodyFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      posture: [
        "border-radius: 8-12px",
        "product image: full-width hero, centered, no text overlay",
        "strictly no decorative gradients or glassmorphism",
        "accent used exactly once - primary CTA button only",
        "spec table / feature list: large font size, generous row height",
        "flat design: no shadows except 0 1px 3px oklch(0% 0 0 / 10%) on cards",
      ],
    },
  },
  {
    id: "ecommerce-convert",
    label: "电商直营",
    summary: "转化导向，价格突出，信任建设，适合旗舰店、品牌直营、大促页面。",
    stylePrompt:
      "ecommerce direct sales, price-forward hierarchy, commerce red, trust signals",
    preview: {
      kind: "gradient",
      value: "linear-gradient(135deg, #ffffff 0%, #fff5f5 60%, #e31c23 100%)",
    },
    spec: {
      palette: {
        bg: "oklch(100% 0 0)",
        surface: "oklch(98% 0.005 50)",
        fg: "oklch(15% 0.010 0)",
        muted: "oklch(50% 0.010 0)",
        border: "oklch(88% 0.008 0)",
        accent: "oklch(50% 0.22 23)",
      },
      displayFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      bodyFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      posture: [
        "border-radius: 4-8px",
        "price number: font-size 1.5-2x body; font-weight: 700; color: accent",
        "original price: line-through; muted color; next to current price",
        "dual CTA: primary '立即购买' (accent fill) + secondary '加入购物车' (outline)",
        "trust signals section: review count, shipping info, return policy",
        "badge/tag density: high - sale tags, 'new', stock warnings",
      ],
    },
  },
  {
    id: "short-video",
    label: "短视频沉浸",
    summary: "极暗背景，抖音青红双配色，全出血媒体，适合内容平台、直播、娱乐应用。",
    stylePrompt:
      "short video immersive dark, tiktok cyan red dual accent, full-bleed media",
    preview: {
      kind: "gradient",
      value: "linear-gradient(135deg, #0a0a12 0%, #0d0d18 60%, #25f4ee 100%)",
    },
    spec: {
      palette: {
        bg: "oklch(8% 0.005 285)",
        surface: "oklch(14% 0.008 285)",
        fg: "oklch(96% 0.005 85)",
        muted: "oklch(55% 0.010 285)",
        border: "oklch(22% 0.012 285)",
        accent: "oklch(72% 0.22 185)",
      },
      displayFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      bodyFont: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
      posture: [
        "border-radius: 0-10px",
        "full-bleed media backgrounds with dark overlay gradients",
        "font-weight: 900 for all display headings",
        "secondary accent (red): oklch(55% 0.23 22) - use for CTAs only",
        "accent (cyan) used once - highlight or logo mark",
        "strictly no light backgrounds or warm neutrals",
      ],
    },
  },
];

export function getChineseDirection(id: string): DesignDirectionSuggestion | undefined {
  return CHINESE_DIRECTIONS.find(direction => direction.id === id);
}
