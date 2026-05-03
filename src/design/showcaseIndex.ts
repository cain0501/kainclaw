import type { DesignOutputType } from "./designPrompt";

export type DesignDirectionPreview = {
  kind: "gradient";
  value: string;
};

export type DesignDirectionSuggestion = {
  id: string;
  label: string;
  summary: string;
  stylePrompt: string;
  preview: DesignDirectionPreview;
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
