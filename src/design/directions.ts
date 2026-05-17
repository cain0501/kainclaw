/**
 * Built-in design direction library.
 * Ported from nexu-io/open-design apps/daemon/src/prompts/directions.ts
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
    id: "editorial-monocle",
    label: "Editorial — Monocle / FT magazine",
    zhLabel: "Editorial — Monocle / FT",
    zhSummary: "杂志感 · 精致排版 · 高级感",
    mood: "Print-magazine feel for explicitly editorial or publishing briefs. Generous whitespace, large serif headlines, restrained palette of neutral paper + ink + a single brand-justified accent. Do not use this as the default for commerce, SaaS, dashboards, or product utilities.",
    references: ["Monocle", "The Financial Times Weekend", "NYT Magazine", "It's Nice That"],
    displayFont: "'Iowan Old Style', 'Charter', Georgia, serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    palette: {
      bg:      "oklch(98% 0.004 95)",
      surface: "oklch(100% 0.002 95)",
      fg:      "oklch(20% 0.018 70)",
      muted:   "oklch(48% 0.012 70)",
      border:  "oklch(90% 0.006 95)",
      accent:  "oklch(52% 0.10 28)",
    },
    posture: [
      "serif display, sans body, mono for metadata only",
      "no shadows, no rounded cards — borders + whitespace do the work",
      "one decisive image, cropped only at the bottom",
      "kicker / eyebrow in mono uppercase, one accent color, used at most twice; never create peach/pink/orange-beige page washes",
    ],
  },
  {
    id: "modern-minimal",
    label: "Modern minimal — Linear / Vercel",
    zhLabel: "Modern minimal — Linear / Vercel",
    zhSummary: "极简 · 科技感 · 大量留白",
    mood: "Software-product minimal. Clean neutral foundation, cobalt accent, geometric display. Great for SaaS, dev tools, B2B apps, and dashboards where clarity is the product.",
    references: ["Linear", "Vercel", "Loom", "Raycast"],
    displayFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    palette: {
      bg:      "oklch(99% 0.002 240)",
      surface: "oklch(100% 0 0)",
      fg:      "oklch(18% 0.012 250)",
      muted:   "oklch(54% 0.012 250)",
      border:  "oklch(92% 0.005 250)",
      accent:  "oklch(58% 0.18 255)",
    },
    posture: [
      "tight letter-spacing on display sizes (-0.02em)",
      "hairline borders only, no shadows except dropdowns/modals",
      "mono numerics with `font-variant-numeric: tabular-nums`",
      "sticky frosted nav, content-led layouts with one product illustration or data visualization",
      "controlled color system: primary action color + one secondary signal + status colors",
    ],
  },
  {
    id: "human-approachable",
    label: "Human / approachable — Airbnb / Duolingo systems",
    zhLabel: "Human / approachable — Airbnb / Duolingo",
    zhSummary: "温暖亲切 · 易用感 · 友好",
    mood: "Friendly and tactile without the generic cozy canvas. Uses a clean neutral background, product-led color system, generous radii, and clear hierarchy. Good for consumer tools, marketplaces, wellness, education, and indie SaaS.",
    references: ["Airbnb", "Duolingo product surfaces", "Miro", "Mercury"],
    displayFont: "'Söhne', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    palette: {
      bg:      "oklch(98% 0.004 240)",
      surface: "oklch(100% 0 0)",
      fg:      "oklch(20% 0.02 240)",
      muted:   "oklch(50% 0.018 240)",
      border:  "oklch(90% 0.006 240)",
      accent:  "oklch(56% 0.12 170)",
    },
    posture: [
      "sans display with strong weight contrast, system body for readability",
      "comfortable radii (12–18px) paired with crisp grid alignment",
      "primary action color plus a secondary/domain accent and clear status colors",
      "subtle elevation only on interactive cards",
      "avoid generic pastel/beige gradients; use real product screenshots, data, or labelled placeholders",
    ],
  },
  {
    id: "tech-utility",
    label: "Tech / utility — Datadog / GitHub",
    zhLabel: "Tech / utility — Datadog / GitHub",
    zhSummary: "功能优先 · 信息密度高 · 开发者风格",
    mood: "Data-dense, monospace-friendly, dark or light + grid. Made for engineers and operators who want information per square inch, not vibes.",
    references: ["Datadog", "GitHub", "Cloudflare dashboard", "Sentry"],
    displayFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      "oklch(98% 0.005 250)",
      surface: "oklch(100% 0 0)",
      fg:      "oklch(22% 0.02 240)",
      muted:   "oklch(50% 0.018 240)",
      border:  "oklch(90% 0.008 240)",
      accent:  "oklch(58% 0.16 145)",
    },
    posture: [
      "sans display + sans body (one family) is OK here — utility trumps editorial",
      "tabular numerics everywhere, mono for code / IDs / hashes",
      "dense tables with hairline borders, no row striping",
      "inline status pills (success / warn / danger) with restrained tinted backgrounds",
      "avoid: hero images, oversized headlines, marketing copy — show the product instead",
    ],
  },
  {
    id: "brutalist-experimental",
    label: "Brutalist / experimental — Are.na / Yale",
    zhLabel: "Brutalist / experimental — Are.na / Yale",
    zhSummary: "大胆实验 · 艺术感 · 非常规",
    mood: "Loud type. Visible grid. System sans + a single oversized serif. Deliberate ugliness as confidence. Great for art, indie, agency, manifesto pages.",
    references: ["Are.na", "Yale Center for British Art", "mschf", "Read.cv"],
    displayFont: "'Times New Roman', 'Iowan Old Style', Georgia, serif",
    bodyFont: "ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",
    palette: {
      bg:      "oklch(98% 0.004 240)",
      surface: "oklch(100% 0 0)",
      fg:      "oklch(15% 0.02 100)",
      muted:   "oklch(40% 0.02 100)",
      border:  "oklch(15% 0.02 100)",
      accent:  "oklch(60% 0.22 25)",
    },
    posture: [
      "display = serif at extreme sizes (clamp(80px, 12vw, 200px))",
      "body = monospace — yes, monospace as body, deliberately",
      "borders are full-strength fg (1.5–2px), not muted greys",
      "asymmetric layouts: one column 70%, the other 30%",
      "almost no border-radius (0–2px). No shadows. No gradients.",
      "underline links, no hover decoration — let the typography carry it",
    ],
  },
];

export function renderDirectionFormBody(): string {
  const cards = DESIGN_DIRECTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    zhLabel: d.zhLabel ?? d.label,
    zhSummary: d.zhSummary ?? "",
    mood: d.mood,
    references: d.references,
    palette: [d.palette.bg, d.palette.surface, d.palette.border, d.palette.muted, d.palette.fg, d.palette.accent],
    displayFont: d.displayFont,
    bodyFont: d.bodyFont,
  }));

  const form = {
    description: "No brand to match — pick a visual direction. Each one ships with a real palette, font stack, and layout posture. You can override the accent below.",
    zhDescription: "没有品牌要对齐时，请先选一个设计风格方向。每个方向都自带真实配色、字体和版式姿态；你也可以在下方覆盖强调色。",
    questions: [
      {
        id: "direction",
        label: "Direction",
        zhLabel: "设计风格方向",
        type: "direction-cards",
        required: true,
        options: DESIGN_DIRECTIONS.map((d) => d.id),
        cards,
      },
      {
        id: "accent_override",
        label: "Accent override (optional)",
        zhLabel: "强调色覆盖（可选）",
        type: "text",
        placeholder: 'e.g. "use moss green instead of cobalt", "no orange — too brand-y for us"',
        zhPlaceholder: "例如：用橙色替换默认蓝色，不要太品牌化的颜色",
      },
    ],
  };

  return JSON.stringify(form, null, 2);
}

export function renderDirectionSpecBlock(): string {
  const lines: string[] = [
    "## Direction library — bind into `:root` when the user picks one",
    "",
    "Each direction below carries a CSS-ready palette (OKLch values) and font stacks. When the user selects one in the direction-form, replace the seed template's `:root` block with that direction's palette and font stacks **verbatim** — do not improvise. Posture cues describe how that direction *behaves* (border weight, radius, accent budget); honour them in the layout choices.",
    "",
  ];
  for (const d of DESIGN_DIRECTIONS) {
    lines.push(`### ${d.label}  \`(id: ${d.id})\``);
    lines.push("");
    lines.push(`**Mood:** ${d.mood}`);
    lines.push("");
    lines.push(`**References:** ${d.references.join(", ")}.`);
    lines.push("");
    lines.push("**Palette (drop into `:root`):**");
    lines.push("");
    lines.push("```css");
    lines.push(`:root {`);
    lines.push(`  --bg:      ${d.palette.bg};`);
    lines.push(`  --surface: ${d.palette.surface};`);
    lines.push(`  --fg:      ${d.palette.fg};`);
    lines.push(`  --muted:   ${d.palette.muted};`);
    lines.push(`  --border:  ${d.palette.border};`);
    lines.push(`  --accent:  ${d.palette.accent};`);
    lines.push("");
    lines.push(`  --font-display: ${d.displayFont};`);
    lines.push(`  --font-body:    ${d.bodyFont};`);
    if (d.monoFont) lines.push(`  --font-mono:    ${d.monoFont};`);
    lines.push(`}`);
    lines.push("```");
    lines.push("");
    lines.push("**Posture:**");
    for (const p of d.posture) lines.push(`- ${p}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function findDirectionById(id: string): DesignDirection | undefined {
  return DESIGN_DIRECTIONS.find((d) => d.id === id);
}
