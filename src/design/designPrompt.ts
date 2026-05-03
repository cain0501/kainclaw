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

export function buildKainClawDesignSystemPrompt(options?: {
  customInstructions?: string;
}): string {
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
    "Visual direction rules:",
    "- Avoid generic AI blue/purple gradients and generic landing-page symmetry.",
    "- Use deliberate whitespace, strong typography contrast, and a distinct visual mood.",
    "- Keep the result immediately previewable in a browser without build tools.",
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
