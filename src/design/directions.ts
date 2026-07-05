/**
 * Built-in KainClaw design direction library.
 *
 * These ids are product contracts used by the design-chat discovery form.
 * Keep ids stable; visible copy can be refined.
 */

export interface DesignDirection {
  id: string;
  label: string;
  zhLabel?: string;
  zhSummary?: string;
  mood: string;
  references: string[];
  displayFont: string;
  bodyFont: string;
  monoFont?: string;
  palette: {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    border: string;
    accent: string;
  };
  posture: string[];
}

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: "lifestyle-redbook",
    label: "Warm Lifestyle / Redbook",
    zhLabel: "暖调生活",
    zhSummary: "珊瑚红 · 生活方式 · 精致亲和",
    mood: "Warm lifestyle editorial for beauty, home, wellness, local services, creators, and consumer brands. Soft neutral base with a coral-red accent, tactile imagery, and elegant Chinese typography. It should feel like premium Xiaohongshu/Redbook content, not generic beige SaaS.",
    references: ["Xiaohongshu lifestyle notes", "Kinfolk", "Airbnb editorial", "Nowness"],
    displayFont: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, serif",
    bodyFont: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    palette: {
      bg: "oklch(98% 0.012 48)",
      surface: "oklch(100% 0.004 48)",
      fg: "oklch(22% 0.026 38)",
      muted: "oklch(52% 0.032 42)",
      border: "oklch(89% 0.018 48)",
      accent: "oklch(63% 0.18 29)",
    },
    posture: [
      "use Noto Serif SC for hero/title moments and Noto Sans SC for body copy",
      "coral red is the only dominant accent; pair it with warm ivory and ink, not orange-beige page washes",
      "use editorial image crops, soft dividers, and tactile detail captions",
      "cards may be softly rounded, but keep hierarchy crisp and premium",
      "avoid generic pastel gradients, fake bokeh, and oversized marketing hero cards",
    ],
  },
  {
    id: "streetwear-dark",
    label: "Streetwear Dark",
    zhLabel: "潮流暗黑",
    zhSummary: "黑底 · 荧光绿 · 街头张力",
    mood: "Dark, high-contrast streetwear energy for fashion drops, music, youth culture, creator brands, and experimental campaigns. Black foundation, neon-green accent, condensed display type, strong edges, and confident asymmetry.",
    references: ["Nike SNKRS", "032c", "MSCHF", "Supreme campaign pages"],
    displayFont: "'Bebas Neue', 'Anton', 'Impact', 'Arial Black', sans-serif",
    bodyFont: "'Inter', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg: "oklch(13% 0.018 145)",
      surface: "oklch(18% 0.02 145)",
      fg: "oklch(96% 0.006 145)",
      muted: "oklch(70% 0.016 145)",
      border: "oklch(32% 0.035 145)",
      accent: "oklch(83% 0.26 145)",
    },
    posture: [
      "dark background is mandatory; do not invert into a light lifestyle palette",
      "neon green is the decisive accent for CTAs, highlights, and active states",
      "use condensed display type, large numerals, sharp grid cuts, and visible borders",
      "prefer asymmetric editorial blocks over centered SaaS hero layouts",
      "avoid soft shadows, pastel gradients, beige surfaces, and gentle rounded-card compositions",
    ],
  },
  {
    id: "tech-flagship",
    label: "Tech Flagship",
    zhLabel: "科技旗舰",
    zhSummary: "冷白 · 电光蓝 · 高端科技",
    mood: "Premium technology flagship for AI, hardware, developer tools, enterprise SaaS, and product launches. Clean cold foundation, electric-blue accent, confident whitespace, precise grids, and product-first evidence.",
    references: ["Apple product pages", "OpenAI product surfaces", "Linear", "Vercel"],
    displayFont: "'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    bodyFont: "'SF Pro Text', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg: "oklch(99% 0.004 250)",
      surface: "oklch(100% 0.001 250)",
      fg: "oklch(18% 0.018 250)",
      muted: "oklch(52% 0.018 250)",
      border: "oklch(90% 0.008 250)",
      accent: "oklch(61% 0.21 255)",
    },
    posture: [
      "lead with product screenshots, metrics, or system diagrams rather than decorative illustration",
      "use cold neutrals, electric blue, hairline borders, and disciplined spacing",
      "make typography precise and compact; reserve large type for the actual flagship claim",
      "use subtle glass only for functional overlays, not as a page-wide decoration",
      "avoid purple-blue gradient sludge and generic dark-slate SaaS sameness",
    ],
  },
  {
    id: "ecommerce-convert",
    label: "E-commerce Convert",
    zhLabel: "电商转化",
    zhSummary: "高转化 · 商品优先 · 清晰行动",
    mood: "Conversion-focused commerce for stores, product detail pages, drops, offers, and service packages. Product imagery, price/value hierarchy, trust signals, and clear CTAs matter more than ambience.",
    references: ["Shopify product pages", "Tmall product detail", "Nike commerce", "Glossier"],
    displayFont: "'Inter Tight', 'Inter', 'PingFang SC', system-ui, sans-serif",
    bodyFont: "'Inter', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    palette: {
      bg: "oklch(98% 0.006 82)",
      surface: "oklch(100% 0.002 82)",
      fg: "oklch(19% 0.018 78)",
      muted: "oklch(48% 0.018 78)",
      border: "oklch(88% 0.012 82)",
      accent: "oklch(57% 0.2 42)",
    },
    posture: [
      "product image, price/value, CTA, and proof must be visible without hunting",
      "use comparison rows, badges, inventory cues, and compact trust modules",
      "accent should drive buying action; avoid spreading it across decorative flourishes",
      "keep repeated cards dense and scannable with stable image ratios",
      "avoid editorial vagueness, oversized empty hero sections, and low-contrast beige commerce",
    ],
  },
  {
    id: "short-video",
    label: "Short Video / Creator",
    zhLabel: "短视频爆款",
    zhSummary: "高能 · 节奏快 · 强视觉钩子",
    mood: "High-energy creator and short-video campaign style for livestreams, courses, social campaigns, and attention-driven launches. Bold hooks, stacked modules, vivid accent, and rapid scan rhythm.",
    references: ["Douyin campaign pages", "TikTok creator pages", "Bilibili event pages", "Creator launch funnels"],
    displayFont: "'Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', 'Arial Black', system-ui, sans-serif",
    bodyFont: "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    palette: {
      bg: "oklch(97% 0.016 338)",
      surface: "oklch(100% 0.003 338)",
      fg: "oklch(17% 0.03 320)",
      muted: "oklch(48% 0.035 320)",
      border: "oklch(88% 0.026 338)",
      accent: "oklch(66% 0.24 338)",
    },
    posture: [
      "start with an unmistakable hook and fast visual rhythm",
      "use big numeric claims, creator/social proof strips, and stacked CTA moments",
      "accent can be vivid, but keep backgrounds controlled so content remains readable",
      "prefer vertical/mobile-friendly sections and clear screenshot/video placeholders",
      "avoid slow editorial layouts, low-density SaaS cards, and decorative-only gradients",
    ],
  },
];

export function renderDirectionFormBody(): string {
  const cards = DESIGN_DIRECTIONS.map(direction => ({
    id: direction.id,
    label: direction.label,
    zhLabel: direction.zhLabel ?? direction.label,
    zhSummary: direction.zhSummary ?? "",
    mood: direction.mood,
    references: direction.references,
    palette: [
      direction.palette.bg,
      direction.palette.surface,
      direction.palette.border,
      direction.palette.muted,
      direction.palette.fg,
      direction.palette.accent,
    ],
    displayFont: direction.displayFont,
    bodyFont: direction.bodyFont,
  }));

  const form = {
    description: "If there is no existing brand system to match, pick one visual direction. Each direction ships with a real palette, font stack, and layout posture. You can override the accent below.",
    zhDescription: "如果没有现成品牌系统，请先选择一个设计风格方向。每个方向都自带真实配色、字体栈和版式姿态；也可以在下方覆盖强调色。",
    questions: [
      {
        id: "direction",
        label: "Direction",
        zhLabel: "设计风格方向",
        type: "direction-cards",
        required: true,
        options: DESIGN_DIRECTIONS.map(direction => direction.id),
        cards,
      },
      {
        id: "accent_override",
        label: "Accent override (optional)",
        zhLabel: "强调色覆盖（可选）",
        type: "text",
        placeholder: 'e.g. "use moss green instead of coral", "avoid neon for this brand"',
        zhPlaceholder: "例如：用苔藓绿替代珊瑚红，或者这个品牌不要荧光色",
      },
    ],
  };

  return JSON.stringify(form, null, 2);
}

export function renderDirectionSpecBlock(): string {
  const lines: string[] = [
    "## Direction Library - bind into `:root` when the user picks one",
    "",
    "Each direction below carries a CSS-ready palette (OKLch values) and font stacks. When the user selects one in the direction-form, replace the seed template's `:root` block with that direction's palette and font stacks verbatim. Do not improvise colors or fonts. Posture cues describe how that direction behaves; honour them in the layout choices.",
    "",
  ];

  for (const direction of DESIGN_DIRECTIONS) {
    lines.push(`### ${direction.label} \`(id: ${direction.id})\``);
    lines.push("");
    if (direction.zhLabel) {
      lines.push(`**Chinese label:** ${direction.zhLabel}`);
      lines.push("");
    }
    lines.push(`**Mood:** ${direction.mood}`);
    lines.push("");
    lines.push(`**References:** ${direction.references.join(", ")}.`);
    lines.push("");
    lines.push("**Palette (drop into `:root`):**");
    lines.push("");
    lines.push("```css");
    lines.push(":root {");
    lines.push(`  --bg:      ${direction.palette.bg};`);
    lines.push(`  --surface: ${direction.palette.surface};`);
    lines.push(`  --fg:      ${direction.palette.fg};`);
    lines.push(`  --muted:   ${direction.palette.muted};`);
    lines.push(`  --border:  ${direction.palette.border};`);
    lines.push(`  --accent:  ${direction.palette.accent};`);
    lines.push("");
    lines.push(`  --font-display: ${direction.displayFont};`);
    lines.push(`  --font-body:    ${direction.bodyFont};`);
    if (direction.monoFont) {
      lines.push(`  --font-mono:    ${direction.monoFont};`);
    }
    lines.push("}");
    lines.push("```");
    lines.push("");
    lines.push("**Posture:**");
    for (const posture of direction.posture) {
      lines.push(`- ${posture}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function findDirectionById(id: string): DesignDirection | undefined {
  return DESIGN_DIRECTIONS.find(direction => direction.id === id);
}
