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
          "状态 pill（达标/风险/危险）用克制的半透明背景色",
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
    },
  ],
};

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
