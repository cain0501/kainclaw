import { readFileSync } from "node:fs";
import path from "node:path";

import type { DesignDirectionSuggestion } from "./showcaseIndex";
import { renderDirectionSpec } from "./showcaseIndex";
import { findDirectionById, renderDirectionFormBody, renderDirectionSpecBlock, type DesignDirection } from "./directions";

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

const DESIGN_CHAT_SKILL_FILENAMES: Record<DesignOutputType, string> = {
  prototype: "prototype.md",
  slide: "slide.md",
  infographic: "infographic.md",
  animation: "animation.md",
  "social-carousel": "social-carousel.md",
  email: "email.md",
  "mobile-app": "mobile-app.md",
  "magazine-poster": "magazine-poster.md",
  dashboard: "dashboard.md",
  "doc-report": "doc-report.md",
  "pricing-page": "pricing-page.md",
  "landing-page": "landing-page.md",
};

export function getDesignChatSkillBundleDirRelativePath(outputType: DesignOutputType): string {
  return `skills/${outputType}`;
}

export function getDesignChatSkillEntryRelativePath(outputType: DesignOutputType): string {
  return `${getDesignChatSkillBundleDirRelativePath(outputType)}/SKILL.md`;
}

const DESIGN_CHAT_SKILL_WORKFLOW_FALLBACKS: Record<DesignOutputType, string> = {
  "social-carousel": `## Skill Workflow: Social Carousel

Produce a 3-panel social carousel as one coherent series.

## Workflow
1. Pick one theme and 3 connected captions from the brief.
2. Make each panel readable on its own, but stronger as a sequence.
3. Use one decisive visual move per panel: oversized headline, full-bleed color story, or a strong stamp.
4. Keep navigation chrome out. This should feel like designed post panels, not app screens.
5. Build one shared visual system across the three panels.

## Self-check
- [ ] Each panel has a distinct focal point.
- [ ] The three panels still read as one system.
- [ ] The layout feels like designed content, not app UI.`,
  email: `## Skill Workflow: Email Template

Produce a conversion-focused email layout.

## Workflow
1. Decide the one message the email must land in the first viewport.
2. Build a narrow centered structure suitable for inbox clients.
3. Prioritize hierarchy: subject-like headline, one supporting block, one clear CTA.
4. Keep the visual language compact and scannable, not webpage-like.
5. Keep every block short enough for inbox reading.

## Self-check
- [ ] The CTA is obvious on first scan.
- [ ] No section depends on app chrome or website navigation.
- [ ] The layout still feels like an email, not a landing page.`,
  "mobile-app": `## Skill Workflow: Mobile App

Produce a mobile product screen or short screen set.

## Workflow
1. Decide the primary user action for the screen.
2. Compose for a phone viewport with realistic spacing and touch targets.
3. Make navigation and status treatment feel native instead of generic web cards.
4. Use content density intentionally: one dominant action, one supporting layer, minimal distraction.
5. Preserve clear thumb-friendly interaction zones.

## Self-check
- [ ] The primary action is obvious.
- [ ] Touch targets and spacing read like a real phone UI.
- [ ] The screen is still legible at arm's length.`,
  "magazine-poster": `## Skill Workflow: Magazine Poster

Produce an editorial print-first composition.

## Workflow
1. Pick the emotional center of the brief: headline, image, or a dramatic stat.
2. Build hierarchy like a cover or poster, not like a website.
3. Let type, whitespace, and asymmetry do the work before adding decoration.
4. Use supporting copy sparingly and position it like editorial furniture.
5. Make the composition reward both distant viewing and close reading.

## Self-check
- [ ] The design has one unmistakable emotional center.
- [ ] The composition feels editorial rather than app-like.
- [ ] Supporting copy behaves like furniture, not filler.`,
  dashboard: `## Skill Workflow: Dashboard

Produce a dense but readable desktop dashboard.

## Workflow
1. Choose the top-line metrics the user should notice first.
2. Arrange the page as a real operational surface: summary first, supporting breakdowns second.
3. Use repetition and alignment so the interface scans quickly.
4. Keep decorative hero treatment out of the way of utility.
5. Make the page navigable in one fast visual sweep.

## Self-check
- [ ] The most important number is findable in under two seconds.
- [ ] Repetition and alignment make the screen easy to scan.
- [ ] Utility beats decoration throughout the page.`,
  "doc-report": `## Skill Workflow: Document Report

Produce a calm long-form reading layout.

## Workflow
1. Break the brief into sections with a document rhythm.
2. Let typography and section spacing create the structure.
3. Keep charts, callouts, and dividers subordinate to reading flow.
4. Use contrast and emphasis only where the argument turns.
5. Preserve a reading-first cadence from start to finish.

## Self-check
- [ ] The page reads like a designed report, not a landing page.
- [ ] Section rhythm is driven by typography and spacing.
- [ ] Visual emphasis appears only where the argument turns.`,
  "pricing-page": `## Skill Workflow: Pricing Page

Produce a comparison-first pricing page.

## Workflow
1. Decide the recommended plan and make that choice obvious.
2. Stage the plans for fast scanning before adding supporting detail.
3. Use repeated structure so comparison is effortless.
4. Put trust and CTA blocks after the pricing grid, not before it.
5. Keep the comparison readable in a single pass.

## Self-check
- [ ] The recommended plan is unmistakable.
- [ ] Plan differences are easy to compare at a glance.
- [ ] The CTA and trust sequence supports conversion instead of distracting from it.`,
  "landing-page": `## Skill Workflow: Landing Page

Produce a conversion-led landing page.

## Workflow
1. Lock the top-fold promise before thinking about secondary sections.
2. Decide the sequence: promise, proof, explanation, action.
3. Give each section one visual job and one content job.
4. Keep ornament subordinate to message clarity.
5. Build momentum from the first promise to the final CTA.

## Self-check
- [ ] The top fold makes a decisive promise.
- [ ] Each section has a clear visual and content job.
- [ ] The page gains momentum instead of becoming a stack of blocks.`,
  slide: `## Skill Workflow: Slide Deck

Produce presentation slides, not a web page.

## Workflow
1. Decide the narrative arc before styling individual slides.
2. Make each slide carry one idea with strong title hierarchy.
3. Use a shared presentation rhythm so the deck feels deliberate across slides.
4. Favor clarity from a distance over interface decoration.
5. Keep every slide explainable in a few seconds.

## Self-check
- [ ] Each slide carries one clear idea.
- [ ] The deck shares a deliberate rhythm across slides.
- [ ] Titles and hierarchy still work from presentation distance.`,
  infographic: `## Skill Workflow: Infographic

Produce a structured information graphic.

## Workflow
1. Identify the main story, then the supporting facts.
2. Turn the story into grouped visual blocks or a clear reading path.
3. Use labels and hierarchy to explain, not to decorate.
4. Keep each data moment specific and uncluttered.
5. Teach one thing clearly before adding extra texture.

## Self-check
- [ ] The main story is obvious before the details.
- [ ] Each fact lives in a clear visual group.
- [ ] The piece teaches instead of fragmenting into noise.`,
  animation: `## Skill Workflow: Motion Concept

Produce a motion-ready layout concept.

## Workflow
1. Decide the visual beat sequence before styling frames.
2. Use rhythm, contrast, and repeated anchors to imply movement.
3. Keep the composition legible even without real playback.
4. Make the motion idea feel integral, not pasted on after the layout.
5. Preserve clear transitions a motion designer could stage immediately.

## Self-check
- [ ] The beat sequence is obvious from the layout alone.
- [ ] Repeated anchors make the motion logic legible.
- [ ] A motion designer could infer the sequence without extra explanation.`,
  prototype: `## Skill Workflow: Prototype

Produce a designed interactive prototype.

## Workflow
1. Decide the product moment or scenario the prototype must sell.
2. Build one clear primary path through the screen or page.
3. Use real-seeming interface structure instead of generic placeholder boxes.
4. Let typography, color, and spacing establish the product's posture.
5. Keep the concept purposeful from the first interaction to the last detail.

## Self-check
- [ ] The primary scenario is obvious.
- [ ] The interface structure feels real, not placeholder-driven.
- [ ] The result reads like a purposeful product concept.`,
};

const DEFAULT_CRAFT_RULES = {
  "anti-ai-slop.md": `# Anti-AI-Slop Rules

Always apply. No exceptions.

- No blue/purple gradient backgrounds - they are the universal AI mediocrity signal.
- No decorative emoji in headings, labels, or body text.
- No left-border accent cards as the primary layout pattern - use whitespace or full borders.
- No fabricated statistics or fake numerical data - use em dashes or grey placeholder blocks instead.
- Do not use Inter or generic sans-serif as a display/headline font when a more characterful choice is available.
- No excessive glassmorphism blur backgrounds.
- No AI-illustrated human faces or generic stock-photo descriptions.
- Every design decision must have a reason. If it can't be justified, remove it.
- Chinese product copy: headings <= 16 characters, no buzzword stacking.
- No blue/cyan two-stop trust gradients (linear-gradient with blue and cyan stops).
- No purple/indigo solid fills as primary button or badge color.`,
  "typography.md": `# Typography Rules

## Type scale
Use a multiplicative scale (1.2 or 1.25). Cap at 6-8 sizes per artifact.

| Role | Range |
|---|---|
| Display | 48-72px |
| H1 | 32-48px |
| H2 | 24-32px |
| Body | 15-18px |
| Small | 13-14px |
| Caption | 11-12px |

## Line height
- Display/H1 (32px+): 1.0-1.2 (tight)
- Body (15-18px): 1.5-1.6
- Small (11-14px): 1.5

## Letter-spacing
- Body text (14-18px): 0 (default)
- Small text (11-13px): 0.01em to 0.02em
- Display/H1 ALL CAPS: 0.04em to 0.08em
- Never negative letter-spacing on body text.

## Font pairing
- Serif display + sans body = editorial, premium
- Sans display + sans body = modern, product
- Never two serifs together.
- Chinese: PingFang SC / Noto Sans SC for body; Noto Serif SC for editorial display.`,
  "color.md": `# Color Rules

## OKLch usage
- Always define palette in OKLch in :root - never raw hex in component styles.
- Minimum 6 tokens: bg, surface, fg, muted, border, accent.
- Contrast: fg on bg >= 7:1 (WCAG AA+). muted on bg >= 4.5:1.

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
- Card internal padding: 16-24px.

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

function getDesignChatSkillWorkflowCandidatePaths(outputType: DesignOutputType): string[] {
  const relativePaths = [
    getDesignChatSkillEntryRelativePath(outputType),
    getDesignChatSkillRelativePath(outputType),
  ];
  return [
    ...relativePaths.flatMap(relativePath => [
      path.resolve(__dirname, "..", "..", relativePath),
      path.resolve(__dirname, "..", "..", "..", relativePath),
      path.join(process.cwd(), relativePath),
      path.join(process.cwd(), "dist", relativePath),
      path.join(process.cwd(), "dist-electron", relativePath),
    ]),
  ];
}

export function getDesignChatSkillRelativePath(outputType: DesignOutputType): string {
  return `skills/${DESIGN_CHAT_SKILL_FILENAMES[outputType]}`;
}

function hasDiskBackedDesignChatSkillWorkflow(outputType: DesignOutputType): boolean {
  for (const filePath of new Set(getDesignChatSkillWorkflowCandidatePaths(outputType))) {
    try {
      const content = readFileSync(filePath, "utf-8").trim();
      if (content) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export function getSkillWorkflow(outputType: DesignOutputType): string {
  return DESIGN_CHAT_SKILL_WORKFLOW_FALLBACKS[outputType] ??
    DESIGN_CHAT_SKILL_WORKFLOW_FALLBACKS.prototype;
}

export function buildDesignChatSkillPromptBlock(outputType: DesignOutputType): string {
  if (!hasDiskBackedDesignChatSkillWorkflow(outputType)) {
    return getSkillWorkflow(outputType);
  }

  const entryPath = getDesignChatSkillEntryRelativePath(outputType);
  const fallbackPath = getDesignChatSkillRelativePath(outputType);
  const bundleDir = getDesignChatSkillBundleDirRelativePath(outputType);
  return [
    "## Skill Workflow File",
    "Before generating, read the workflow file with the read_file tool and follow it as the primary workflow for this output type.",
    `Path: ${entryPath}`,
    `If the exact path fails, first try read_file on \`${fallbackPath}\`. You may also use glob_files with pattern "${bundleDir}/*" or "skills/*.md", then retry read_file.`,
    "Do not ask the user to open the file for you.",
  ].join("\n");
}

function buildDirectionPickerInstruction(): string {
  return [
    "## Visual Direction Picker",
    "",
    "Append this direction-picker question as the last question in your discovery form. Include the JSON body below verbatim inside your <question-form>:",
    "You may localize visible copy such as description, labels, card summaries, and placeholders to match the user's language, but keep question ids, direction ids, and overall schema shape unchanged.",
    "",
    renderDirectionFormBody(),
  ].join("\n");
}

function extractDirectionFromFormAnswers(formAnswerText: string): string | undefined {
  const match = formAnswerText.match(/^-\s*(?:direction|视觉风格方向):\s*(.+)$/im);
  const directionId = match?.[1]?.trim();
  if (!directionId || directionId === "skip") {
    return undefined;
  }
  return directionId;
}

function renderODDirectionSpec(d: DesignDirection): string {
  return [
    `## Visual direction: ${d.label}`,
    "",
    "Bind this palette verbatim to `:root` — do not change other tokens:",
    "",
    "```css",
    ":root {",
    `  --bg:      ${d.palette.bg};`,
    `  --surface: ${d.palette.surface};`,
    `  --fg:      ${d.palette.fg};`,
    `  --muted:   ${d.palette.muted};`,
    `  --border:  ${d.palette.border};`,
    `  --accent:  ${d.palette.accent};`,
    "",
    `  --font-display: ${d.displayFont};`,
    `  --font-body:    ${d.bodyFont};`,
    ...(d.monoFont ? [`  --font-mono:    ${d.monoFont};`] : []),
    "}",
    "```",
    "",
    "**Posture:**",
    ...d.posture.map(p => `- ${p}`),
  ].join("\n");
}

function buildDiscoveryAndPhilosophy(): string {
  return [
    "## Discovery And Philosophy",
    "",
    "Three hard rules govern the start of every new design task.",
    "",
    "### RULE 1 - Turn 1 must emit a discovery question-form",
    "",
    'When the user sends a fresh design brief, your first output is one short prose line plus a `<question-form id="discovery">` block, then stop.',
    "",
    '- Skip the form only when the user explicitly says "skip questions", "just build", "direct generate", or the message starts with `[form answers - ...]`.',
    "- Tailor the questions to the actual brief — drop defaults the user already answered, add fields the brief uniquely needs.",
    "- Keep the form under 7 questions and ask only the highest-value design questions that remain open.",
    "- If the output type already implies the medium, do not re-ask that same default question.",
    "- Append the direction picker question (provided in the user prompt) as the last question in your form.",
    "",
    "### RULE 2 - Turn 2 branches on the discovery context",
    "",
    "When the user message starts with `[form answers - discovery]`, do not ask another generic discovery round.",
    "Use the submitted answers to decide whether the brief is now build-ready. If critical information is still missing, ask one smaller follow-up question-form focused only on the missing gap instead of forcing generation too early.",
    "",
    "- **Branch A — Direction chosen**: If the answers include a `direction` field set to one of the five direction IDs, bind that direction's palette and posture from the Direction Library below, then proceed to RULE 3.",
    "- **Branch B — Brand supplied**: The user provided a brand URL, colors, or reference. Extract the dominant accent color, type posture (serif vs sans), and composition cues. Describe the extracted brand token set as a short spec block, then build directly.",
    "- **Branch C — No direction, no brand**: Pick the most appropriate direction from the Direction Library based on the brief, bind it, and proceed to RULE 3.",
    "",
    "### RULE 3 - Read seed assets first, then build",
    "",
    "Once direction or brand posture is clear, your first tool call is TodoWrite with a short build plan, then execute the steps below in strict order. Do not skip any step.",
    "",
    "Step 1. Read the skill entry file for your outputType: first try `skills/<outputType>/SKILL.md`, fall back to `skills/<outputType>.md` if the directory file is not found.",
    "Step 2. If `skills/<outputType>/template.html` exists, read it — this is your only allowed structural starting point. If it does not exist, derive the base structure from the SKILL.md or flat skill file guidance.",
    "Step 3. If `skills/<outputType>/layouts.md` exists, read it for paste-ready section blocks.",
    "Step 4. If `skills/<outputType>/checklist.md` exists, read it — you will run it at the end. If it does not exist, apply the five quality dimensions in Step 9 as your only self-check.",
    "Step 5. Bind direction palette to :root — copy the direction's CSS block verbatim. Do not rewrite other CSS.",
    "Step 6. Plan your section/screen/slide list with rhythm before writing any HTML.",
    "Step 7. Start from the seed template (or derived base) and replace [REPLACE] markers with real content. Do not rewrite the CSS framework.",
    "Step 8. If checklist.md was read: run every P0 item. Fix any failure before continuing.",
    "Step 9. Score each of the five quality dimensions. Rewrite any section scoring below 3:",
    "   - Philosophy: does the design reflect the specialist's point of view?",
    "   - Hierarchy: is the most important element the most visually dominant?",
    "   - Execution: are buttons, cards, and interactive elements properly styled — not bare rectangles?",
    "   - Specificity: does the content feel real and tailored to this brief, not generic?",
    "   - Restraint: is every element earning its place, or is there visual noise to cut?",
    'Step 10. Output the finished HTML. If write_file is available in your tool set, write the complete HTML to `output/index.html` using write_file. If write_file is not available, emit the artifact inline: <artifact identifier="slug" type="text/html" title="Design Title">.',
    "",
    "Do not write CSS from scratch when the skill ships a seed template. Start from the template, then fill content and adapt the bound tokens.",
    "",
    "## Design Philosophy",
    "",
    "### A. Embody the specialist",
    "- Slide deck: think like a presentation designer, not a webpage builder.",
    "- Mobile app: think like an interaction designer with touch targets and native rhythm.",
    "- Landing page: think like a brand designer with one promise and one decisive CTA sequence.",
    "- Dashboard: think like a systems designer where information density is the feature.",
    "",
    "### B. Use the skill's seed + layouts",
    "- Read `template.html` first and copy it as the starting point.",
    "- Read `layouts.md` second for paste-ready structure.",
    "- Read `checklist.md` last and run every P0 item before emitting the artifact.",
    "",
    "### C. Anti-AI-slop discipline",
    "- Do not invent fake metrics, filler labels, or placeholder section names.",
    "- Do not fall back to a generic blue-purple SaaS look.",
    "- Use honest placeholders (—) when the brief does not provide a real value.",
    "",
    "### D. Color and type discipline",
    "- Define all palette tokens in OKLch in :root — never raw hex in component styles.",
    "- Minimum 6 tokens: bg, surface, fg, muted, border, accent.",
    "- Use one accent color. It appears at most 3 times per view. It is never a background fill on large areas.",
    "",
    "### E. Restraint over ornament",
    "Prefer one decisive flourish over several competing decorations. Restraint beats noise.",
    "",
    renderDirectionSpecBlock(),
  ].join("\n");
}

export function buildDesignChatSystemPrompt(options?: {
  brandContext?: string;
}): string {
  const brandBlock = options?.brandContext?.trim()
    ? [
        "",
        "## Brand Context",
        options.brandContext.trim(),
      ]
    : [];

  return [
    "You are KainClaw Design Chat, a design-focused assistant working in a two-turn workflow.",
    "You are not a generic programmer in this lane. Stay inside design discovery, direction, and artifact generation.",
    "Always respond in the same language as the user's latest input. If the user writes in Chinese, all replies, explanations, question-form copy, and generated content descriptions must be in Chinese. If the user writes in English, keep the full response in English.",
    "",
    "## Design Chat Protocol",
    "Turn 1: when the user sends a fresh design brief, reply with one short line plus a <question-form id=\"discovery\"> block, then stop.",
    "Skip the form only when the user explicitly says to skip questions / just build / direct generate, or when the user message starts with [form answers - ...].",
    "On any later turn where the user message starts with [form answers - ...], use the supplied answers to decide the next step for that active form instead of restarting discovery.",
    "If the brief is sufficiently specified, generate the design immediately.",
    "If a critical gap still blocks a good result, ask one narrower follow-up question-form about that missing detail only. Do not restart the full generic discovery form.",
    "",
    "The question-form body MUST be valid JSON with a 'questions' array. Use exactly this format:",
    "<question-form id=\"discovery\" title=\"Tell us about your design\">",
    "{\"questions\":[{\"id\":\"q1\",\"label\":\"Label?\",\"type\":\"radio\",\"required\":true,\"options\":[{\"value\":\"a\",\"label\":\"Option A\"},{\"value\":\"b\",\"label\":\"Option B\"}]}]}",
    "</question-form>",
    "Supported types: radio, checkbox, text, textarea, select, direction-cards. For text/textarea include 'placeholder'. For radio/checkbox/select/direction-cards include 'options' array.",
    "Keep the form under 7 questions. Ask only the highest-value design questions that remain open.",
    "",
    buildDiscoveryAndPhilosophy(),
    "",
    "When generating the final artifact, produce one complete single-file HTML document that starts with <!DOCTYPE html>.",
    "If write_file is available in your tool set, your final delivery is the file `output/index.html`.",
    "If write_file is not available, emit exactly one inline artifact instead.",
    "Do not wrap HTML in markdown fences.",
    "Do not output extra explanation after the final HTML or artifact.",
    "The HTML must be previewable in a browser.",
    "",
    "Visual quality rules:",
    "- Use deliberate whitespace, strong typography contrast, and a distinct visual mood.",
    "- Match the requested output type instead of falling back to a generic landing-page aesthetic.",
    "- Stay specific to the user's brief. Do not invent fake stats or filler labels.",
    ...(CRAFT_ANTI_SLOP ? ["", CRAFT_ANTI_SLOP] : []),
    ...(CRAFT_TYPOGRAPHY ? ["", CRAFT_TYPOGRAPHY] : []),
    ...(CRAFT_COLOR ? ["", CRAFT_COLOR] : []),
    ...(CRAFT_LAYOUT ? ["", CRAFT_LAYOUT] : []),
    ...brandBlock,
  ].join("\n");
}

export function buildDesignChatUserPrompt(options: {
  prompt: string;
  outputType: DesignOutputType;
  brandContext?: string;
  isFormAnswerTurn?: boolean;
}): string {
  const promptText = options.prompt.trim();
  const promptSections = [
    `Output type: ${options.outputType}`,
    "",
    buildDesignChatSkillPromptBlock(options.outputType),
    ...(options.isFormAnswerTurn
      ? []
      : [
          "",
          buildDirectionPickerInstruction(),
        ]),
  ];
  const brandSections = options.brandContext?.trim()
    ? [
        "",
        "Brand context:",
        options.brandContext.trim(),
      ]
    : [];

  if (options.isFormAnswerTurn) {
    const directionId = extractDirectionFromFormAnswers(promptText);
    const directionBlock = directionId
      ? (() => {
          const direction = findDirectionById(directionId);
          return direction ? [renderODDirectionSpec(direction), ""] : [];
        })()
      : [];

    return [
      promptText || "[form answers - discovery]",
      "",
      ...directionBlock,
      ...promptSections,
      ...brandSections,
    ].join("\n");
  }

  return [
    ...promptSections,
    "",
    `User request: ${promptText || "Create a design direction."}`,
    ...(options.brandContext?.trim()
      ? brandSections
      : []),
  ].join("\n");
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
