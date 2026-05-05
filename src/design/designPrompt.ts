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
  | "animation";

import type { DesignDirectionSuggestion } from "./showcaseIndex";
import { renderDirectionSpec } from "./showcaseIndex";

const ANTI_SLOP_RULES = [
  "",
  "Anti-slop rules (always apply, no exceptions):",
  "- No blue/purple gradient backgrounds — they are the universal AI mediocrity signal.",
  "- No decorative emoji in headings, labels, or body text (✅ ❌ 🚀 💡 and similar).",
  "- No left-border accent cards as the primary layout pattern — use whitespace or full borders.",
  "- No fabricated statistics or fake numerical data — use '—' or grey placeholder blocks instead.",
  "- Do not use Inter or generic sans-serif as a display/headline font when a more characterful choice is available.",
  "- No excessive glassmorphism blur backgrounds.",
  "- No AI-illustrated human faces or generic stock-photo descriptions.",
  "- Every design decision must have a reason. If it can't be justified, remove it.",
  "- Chinese product copy: headings ≤ 16 characters, no buzzword stacking (智能/赋能/生态).",
];

export function buildKainClawDesignSystemPrompt(options?: {
  customInstructions?: string;
  selectedDirection?: DesignDirectionSuggestion;
}): string {
  const directionBlock = options?.selectedDirection
    ? ["", renderDirectionSpec(options.selectedDirection)]
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
    ...ANTI_SLOP_RULES,
    ...directionBlock,
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
  referenceImageDataUrl?: string;
}): string {
  return [
    `Output type: ${options.outputType}`,
    `User request: ${options.prompt.trim() || "Create a design direction."}`,
    ...(options.style?.trim() ? [`Requested style: ${options.style.trim()}`] : []),
    ...(options.referenceImageDataUrl
      ? [
          "A reference image is attached separately or available in context. Use it as a visual direction input when present.",
        ]
      : []),
  ].join("\n");
}
