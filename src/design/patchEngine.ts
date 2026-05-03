import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";

export const KAINCLAW_DESIGN_PATCH_NODE_START = "<!-- PATCH_NODE_START -->";
export const KAINCLAW_DESIGN_PATCH_NODE_END = "<!-- PATCH_NODE_END -->";

export function buildKainClawDesignPatchSystemPrompt(): string {
  return [
    "You are KainClaw Design Patch, a design-focused HTML editor.",
    "You rewrite only one selected node inside an existing HTML design.",
    "",
    "Hard rules:",
    "- Return only one replacement HTML node for the requested target.",
    "- Do not rewrite the whole page.",
    "- Keep existing CSS variable usage whenever possible.",
    `- Wrap the returned node with ${KAINCLAW_DESIGN_PATCH_NODE_START} and ${KAINCLAW_DESIGN_PATCH_NODE_END}.`,
    "- Do not include markdown fences or explanation.",
  ].join("\n");
}

export function buildKainClawDesignPatchPrompt(options: {
  html: string;
  selector: string;
  comment: string;
}): string {
  return [
    "You are editing one existing HTML design node.",
    "Return only the replacement node for the selected target.",
    "",
    `Target selector: ${options.selector}`,
    `User comment: ${options.comment.trim()}`,
    "",
    "Rules:",
    "- Return only one replacement HTML node.",
    "- Do not rewrite the whole page.",
    "- Keep existing CSS variable usage whenever possible.",
    `- Wrap the returned node with ${KAINCLAW_DESIGN_PATCH_NODE_START} and ${KAINCLAW_DESIGN_PATCH_NODE_END}.`,
    "- Do not include markdown fences or explanation.",
    "",
    "Current full HTML:",
    options.html,
  ].join("\n");
}

export function extractPatchNode(rawText: string): string {
  const startIndex = rawText.indexOf(KAINCLAW_DESIGN_PATCH_NODE_START);
  const endIndex = rawText.indexOf(KAINCLAW_DESIGN_PATCH_NODE_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("KainClaw Design patch response is missing the PATCH_NODE section.");
  }

  const node = rawText
    .slice(startIndex + KAINCLAW_DESIGN_PATCH_NODE_START.length, endIndex)
    .trim();
  if (!node.startsWith("<")) {
    throw new Error("KainClaw Design patch response did not return a valid HTML node.");
  }

  return node;
}

function replaceOuterHtmlOnce(
  html: string,
  targetOuterHtml: string,
  replacementNode: string,
): string {
  const targetIndex = html.indexOf(targetOuterHtml);
  if (targetIndex === -1) {
    throw new Error("Target element could not be located in the current HTML.");
  }

  return (
    html.slice(0, targetIndex) +
    replacementNode +
    html.slice(targetIndex + targetOuterHtml.length)
  );
}

export function applyDesignPatch(options: {
  html: string;
  targetOuterHtml: string;
  replacementNode: string;
}): string {
  return replaceOuterHtmlOnce(
    options.html,
    options.targetOuterHtml,
    options.replacementNode,
  );
}

export async function patchKainClawDesignNode(options: {
  provider: IProviderAdapter;
  html: string;
  selector: string;
  comment: string;
  targetOuterHtml: string;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<{
  replacementNode: string;
  html: string;
  rawOutput: string;
}> {
  const prompt = buildKainClawDesignPatchPrompt({
    html: options.html,
    selector: options.selector,
    comment: options.comment,
  });

  let streamedText = "";
  const step = await options.provider.runStep(
    [{ role: "user", content: prompt }],
    [],
    token => {
      streamedText += token;
      options.onToken?.(token);
    },
    options.signal,
  );

  const rawOutput = (step.text || streamedText).trim();
  if (!rawOutput) {
    throw new Error("KainClaw Design patch returned an empty response.");
  }

  const replacementNode = extractPatchNode(rawOutput);
  const html = applyDesignPatch({
    html: options.html,
    targetOuterHtml: options.targetOuterHtml,
    replacementNode,
  });

  return {
    replacementNode,
    html,
    rawOutput,
  };
}
