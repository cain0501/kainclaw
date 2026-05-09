import { readFileSync } from "node:fs";
import path from "node:path";

import type { DesignDirectionSuggestion } from "./showcaseIndex";
import { renderDirectionSpec } from "./showcaseIndex";

export const KAINCLAW_DESIGN_HTML_START = "<!-- KAINCLAW_DESIGN_HTML_START -->";
export const KAINCLAW_DESIGN_HTML_END = "<!-- KAINCLAW_DESIGN_HTML_END -->";
export const KAINCLAW_DESIGN_SLIDERS_START =
  "<!-- KAINCLAW_DESIGN_SLIDERS_START -->";
export const KAINCLAW_DESIGN_SLIDERS_END =
  "<!-- KAINCLAW_DESIGN_SLIDERS_END -->";

export type DesignOutputType =
  | "prototype"
  | "slide"
  | "infographic"
  | "animation"
  | "social-carousel"
  | "email"
  | "mobile-app"
  | "magazine-poster"
  | "dashboard"
  | "doc-report"
  | "pricing-page"
  | "landing-page";

export const DESIGN_OUTPUT_TYPES = [
  "prototype",
  "slide",
  "infographic",
  "animation",
  "social-carousel",
  "email",
  "mobile-app",
  "magazine-poster",
  "dashboard",
  "doc-report",
  "pricing-page",
  "landing-page",
] as const satisfies readonly DesignOutputType[];

const DESIGN_OUTPUT_TYPE_SET = new Set<DesignOutputType>(DESIGN_OUTPUT_TYPES);

const DEFAULT_CRAFT_RULES = {
  "anti-ai-slop.md": `# Anti-AI-Slop Rules

Always apply. No exceptions.

- No blue/purple gradient backgrounds 鈥?they are the universal AI mediocrity signal.
- No decorative emoji in headings, labels, or body text (鉁?鉂?馃殌 馃挕 and similar).
- No left-border accent cards as the primary layout pattern 鈥?use whitespace or full borders.
- No fabricated statistics or fake numerical data 鈥?use '鈥? or grey placeholder blocks instead.
- Do not use Inter or generic sans-serif as a display/headline font when a more characterful choice is available.
- No excessive glassmorphism blur backgrounds.
- No AI-illustrated human faces or generic stock-photo descriptions.
- Every design decision must have a reason. If it can't be justified, remove it.
- Chinese product copy: headings 鈮?16 characters, no buzzword stacking (鏅鸿兘/璧嬭兘/鐢熸€?.
- No blue鈫抍yan two-stop trust gradients (linear-gradient with blue and cyan stops).
- No purple/indigo solid fills as primary button or badge color.`,
  "typography.md": `# Typography Rules

## Type scale
Use a multiplicative scale (1.2 or 1.25). Cap at 6鈥? sizes per artifact.

| Role | Range |
|---|---|
| Display | 48鈥?2px |
| H1 | 32鈥?8px |
| H2 | 24鈥?2px |
| Body | 15鈥?8px |
| Small | 13鈥?4px |
| Caption | 11鈥?2px |

## Line height
- Display/H1 (鈮?2px): 1.0鈥?.2 (tight)
- Body (15鈥?8px): 1.5鈥?.6
- Small (鈮?4px): 1.5

## Letter-spacing
- Body text (14鈥?8px): 0 (default)
- Small text (11鈥?3px): 0.01em to 0.02em
- Display/H1 ALL CAPS: 0.04em to 0.08em
- Never negative letter-spacing on body text.

## Font pairing
- Serif display + sans body = editorial, premium
- Sans display + sans body = modern, product
- Never two serifs together.
- Chinese: PingFang SC / Noto Sans SC for body; Noto Serif SC for editorial display.`,
  "color.md": `# Color Rules

## OKLch usage
- Always define palette in OKLch in :root 鈥?never raw hex in component styles.
- Minimum 6 tokens: bg, surface, fg, muted, border, accent.
- Contrast: fg on bg 鈮?7:1 (WCAG AA+). muted on bg 鈮?4.5:1.

## Accent discipline
- One accent color per design. Used for primary CTA and key data only.
- Accent appears at most 3 times in a single view.
- Never use accent as a background fill for large areas.

## Forbidden patterns
- No blue/purple gradients (see anti-ai-slop.md).
- No more than 12 raw hex values outside :root.
- No semi-transparent overlays stacked more than 2 levels deep.`,
  "layout.md": `# Layout Rules

## Spacing
- Use 8px base unit. All spacing values must be multiples of 4px (4, 8, 12, 16, 24, 32, 48, 64).
- Section padding: minimum 48px vertical, 24px horizontal.
- Card internal padding: 16鈥?4px.

## Grid
- Content max-width: 1200px for desktop, 760px for editorial/reading.
- Always center content horizontally with auto margins.
- Prefer CSS Grid for 2D layouts, Flexbox for 1D.

## Hierarchy
- Maximum 3 levels of visual hierarchy per section.
- Each section has one dominant element (hero image, headline, or data point).
- Never compete: if two elements fight for attention, remove one.

## Forbidden patterns
- No more than 4 columns on mobile.
- No horizontal scroll on the main content area.
- No fixed pixel heights on text containers (use min-height or auto).`,
} as const;

type CraftRuleFile = keyof typeof DEFAULT_CRAFT_RULES;

function loadCraftRule(filename: CraftRuleFile): string {
  const candidatePaths = [
    path.join(__dirname, "craft", filename),
    path.resolve(__dirname, "../../src/design/craft", filename),
    path.resolve(__dirname, "../../../src/design/craft", filename),
    path.join(process.cwd(), "src", "design", "craft", filename),
    path.join(process.cwd(), "dist", "design", "craft", filename),
    path.join(process.cwd(), "dist-electron", "src", "design", "craft", filename),
  ];

  for (const filePath of new Set(candidatePaths)) {
    try {
      return readFileSync(filePath, "utf-8").trim();
    } catch {
      continue;
    }
  }

  return DEFAULT_CRAFT_RULES[filename].trim();
}

const CRAFT_ANTI_SLOP = loadCraftRule("anti-ai-slop.md");
const CRAFT_TYPOGRAPHY = loadCraftRule("typography.md");
const CRAFT_COLOR = loadCraftRule("color.md");
const CRAFT_LAYOUT = loadCraftRule("layout.md");

export function isDesignOutputType(value: unknown): value is DesignOutputType {
  return typeof value === "string" && DESIGN_OUTPUT_TYPE_SET.has(value as DesignOutputType);
}

export function normalizeDesignOutputType(value: unknown): DesignOutputType {
  return isDesignOutputType(value) ? value : "prototype";
}

function getSkillPatch(outputType: DesignOutputType): string {
  switch (outputType) {
    case "social-carousel":
      return `## Skill: Social Carousel
- Canvas width: 375px.
- Each slide must follow a 9:16 portrait composition.
- One slide = one focal point. Do not crowd multiple ideas into the same screen.
- Use oversized display headlines suitable for mobile reading.
- Do not include navigation bars, desktop chrome, or sidebars.
- Favor bold color blocks or full-bleed imagery with high text contrast.
- Do NOT render the user's structural instructions (e.g. "封面大标题 + 7页干货 + 结尾CTA") as visible subtitle or caption text in the design. These are instructions for you, not content to display.`;
    case "email":
      return `## Skill: Email Template
- Max layout width: 600px and centered.
- Use inline styles only. Do not emit <style> tags or external CSS.
- No JavaScript of any kind.
- Prefer table-based layout for Outlook compatibility.
- All images must include meaningful alt text.`;
    case "mobile-app":
      return `## Skill: Mobile App
- Design for a 375x812px iPhone viewport.
- Follow iOS-style spacing and control conventions.
- Reserve space for a top status bar.
- Include a bottom tab bar when the screen type supports app navigation.
- Prioritize touch target clarity and one-handed readability.`;
    case "magazine-poster":
      return `## Skill: Magazine Poster
- Compose for an 800x1130px canvas (roughly A4 aspect ratio).
- Build strong typographic hierarchy with editorial drama.
- Let layout feel print-first rather than app-like.
- Use image, headline, deck, and supporting copy as a poster system.
- Preserve a tactile, print-inspired mood.`;
    case "dashboard":
      return `## Skill: Dashboard
- Target a 1440px desktop canvas.
- Use high information density with a clear grid structure.
- Include realistic data placeholders using the em dash character (—) instead of fake numbers.
- Prioritize scanability, section labels, and aligned metrics.
- Avoid decorative hero sections that reduce dashboard utility.`;
    case "doc-report":
      return `## Skill: Document Report
- Target a 794px-wide document canvas (A4 reading width).
- Structure the page for print-friendly reading.
- No motion, autoplay, or decorative animation.
- Use calm hierarchy, section dividers, and document-like typography.
- Favor clarity and long-form readability over marketing flair.`;
    case "pricing-page":
      return `## Skill: Pricing Page
- Desktop-first comparison layout.
- Include a 3-column pricing comparison as the core structure.
- Visually highlight one recommended plan.
- Make primary CTA buttons obvious and conversion-focused.
- Keep plan differences easy to compare at a glance.`;
    case "landing-page":
      return `## Skill: Landing Page
- Desktop-first marketing page.
- Structure must include hero, features, and clear CTA sections.
- Optimize hierarchy for conversion, not generic browsing.
- Make the top fold decisive and benefit-led.
- Keep momentum from hero to proof to call-to-action.`;
    default:
      return "";
  }
}

export function buildKainClawDesignSystemPrompt(options?: {
  customInstructions?: string;
  selectedDirection?: DesignDirectionSuggestion;
  brandContext?: string;
}): string {
  const directionBlock = options?.selectedDirection
    ? ["", renderDirectionSpec(options.selectedDirection)]
    : [];
  const brandBlock = options?.brandContext?.trim()
    ? [
        "",
        "## Brand Design System (HIGHEST PRIORITY — overrides everything else)",
        options.brandContext.trim(),
        "",
        "MANDATORY brand color rules (override the generic Color Rules above):",
        "- Use the brand's primary accent color freely — the '3 times max' craft rule does NOT apply when a brand is specified.",
        "- The brand accent color MAY be used as background fill for cards, headers, and CTA sections.",
        "- All interactive elements (buttons, links, highlights, tags) MUST use the brand accent color.",
        "- Do NOT substitute the brand accent with warm neutrals, beige, or off-white.",
      ]
    : [];

  return [
    "You are KainClaw Design, a design-focused HTML generator.",
    "You are a designer who uses HTML/CSS/JS as the output medium, not a generic programmer.",
    "",
    "Hard rules:",
    "- Output exactly two sections in this order: HTML section, then sliders JSON section.",
    `- Wrap the HTML with ${KAINCLAW_DESIGN_HTML_START} and ${KAINCLAW_DESIGN_HTML_END}.`,
    `- Wrap the sliders JSON with ${KAINCLAW_DESIGN_SLIDERS_START} and ${KAINCLAW_DESIGN_SLIDERS_END}.`,
    "- The HTML section must be one complete single-file HTML document that starts with <!DOCTYPE html>.",
    '- The sliders section must be valid JSON with exact shape: { "sliders": SliderDef[] }.',
    "- Expose only 3-7 high-impact sliders.",
    "- Every slider cssVar must already exist in the HTML :root block.",
    "- Do not output markdown fences.",
    "- Do not output explanation before, between, or after the two sections.",
    "",
    "Visual quality rules:",
    "- Use deliberate whitespace, strong typography contrast, and a distinct visual mood.",
    "- Keep the result immediately previewable in a browser without build tools.",
    "- If a direction spec is provided below, bind its :root values verbatim and honour its posture rules.",
    ...(CRAFT_ANTI_SLOP ? ["", CRAFT_ANTI_SLOP] : []),
    ...(CRAFT_TYPOGRAPHY ? ["", CRAFT_TYPOGRAPHY] : []),
    ...brandBlock,
    ...directionBlock,
    ...(CRAFT_COLOR ? ["", CRAFT_COLOR] : []),
    ...(CRAFT_LAYOUT ? ["", CRAFT_LAYOUT] : []),
    "",
    "Slider schema:",
    '- color: { "id", "label", "type":"color", "cssVar", "default" }',
    '- range: { "id", "label", "type":"range", "cssVar", "default", "min", "max", "unit" }',
    '- select: { "id", "label", "type":"select", "cssVar", "default", "options" }',
    ...(options?.customInstructions?.trim()
      ? ["", "Additional instructions:", options.customInstructions.trim()]
      : []),
  ].join("\n");
}

export function buildKainClawDesignUserPrompt(options: {
  prompt: string;
  outputType: DesignOutputType;
  style?: string;
  userContext?: string;
  brandContext?: string;
  referenceImageDataUrl?: string;
}): string {
  const skillPatch = getSkillPatch(options.outputType);
  const hasBrand = !!options.brandContext?.trim();
  return [
    `Output type: ${options.outputType}`,
    ...(skillPatch ? ["", skillPatch] : []),
    `User request: ${options.prompt.trim() || "Create a design direction."}`,
    ...(options.style?.trim() ? [`Requested style: ${options.style.trim()}`] : []),
    ...(options.userContext?.trim()
      ? [
          "",
          "User context (use as content inspiration and audience guidance — do NOT copy these as literal labels or tags into the design):",
          options.userContext.trim(),
          ...(hasBrand ? ["(Note: visual style above is for content direction only; brand color/typography from Brand Design System takes precedence)"] : []),
        ]
      : []),
    ...(options.referenceImageDataUrl
      ? [
          "A reference image is attached separately or available in context. Use it as a visual direction input when present.",
        ]
      : []),
  ].join("\n");
}

export const DESIGN_CRITIQUE_SYSTEM_PROMPT = `
You are a senior UI/UX design critic. Evaluate the given HTML design on exactly 5 dimensions.

Return ONLY valid JSON in this exact shape, no other text:
{
  "dimensions": [
    { "name": "视觉层次", "score": 1, "comment": "一句话评价" },
    { "name": "排版质量", "score": 1, "comment": "一句话评价" },
    { "name": "色彩运用", "score": 1, "comment": "一句话评价" },
    { "name": "内容密度", "score": 1, "comment": "一句话评价" },
    { "name": "风格一致性", "score": 1, "comment": "一句话评价" }
  ],
  "lowestDimension": "得分最低的维度名",
  "suggestion": "针对最低分维度的一条具体改进建议（中文，<=40字）",
  "suggestedStyle": "如果建议换视觉方向，填入 stylePrompt 字符串；否则填 null"
}

Scoring: 5=excellent, 4=good, 3=acceptable, 2=needs improvement, 1=poor.
Be honest and specific. Chinese comments preferred.
`.trim();
