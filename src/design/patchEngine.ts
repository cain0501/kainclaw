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

// ─── Selector-based replacement ──────────────────────────────────────────────

interface SelectorSegment {
  tag: string;
  id?: string;
  classes: string[];
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function parseSelector(selector: string): SelectorSegment[] {
  return selector.split(">").map(seg => {
    const normalized = seg.trim().replace(/:nth-of-type\(\d+\)/g, "");
    const hashIndex = normalized.indexOf("#");
    const dotIndex = normalized.indexOf(".");
    const boundaryIndex = [hashIndex, dotIndex]
      .filter(index => index >= 0)
      .sort((left, right) => left - right)[0] ?? normalized.length;
    const tag = normalized.slice(0, boundaryIndex).trim() || "*";
    const id = hashIndex >= 0
      ? normalized
        .slice(hashIndex + 1, dotIndex >= 0 && dotIndex > hashIndex ? dotIndex : undefined)
        .trim()
        .toLowerCase()
      : "";
    const classPart = dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
    return {
      tag: tag.toLowerCase(),
      ...(id ? { id } : {}),
      classes: classPart ? classPart.split(".").map(c => c.toLowerCase()) : [],
    };
  });
}

interface OpenTagInfo {
  start: number;
  end: number; // index of '>'
  tagName: string;
  attrStr: string;
}

function parseOpenTagAt(html: string, pos: number): OpenTagInfo | null {
  if (html[pos] !== "<") return null;
  const end = html.indexOf(">", pos);
  if (end === -1) return null;
  const inner = html.slice(pos + 1, end).trim();
  if (inner.startsWith("/") || inner.startsWith("!") || inner.startsWith("?")) return null;
  const spaceIdx = inner.search(/[\s/]/);
  const tagName = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).toLowerCase();
  if (!tagName || !/^[a-z][a-z0-9]*$/.test(tagName)) return null;
  const attrStr = spaceIdx === -1 ? "" : inner.slice(spaceIdx);
  return { start: pos, end, tagName, attrStr };
}

function tagMatchesSegment(info: OpenTagInfo, seg: SelectorSegment): boolean {
  if (seg.tag !== "*" && info.tagName !== seg.tag) return false;
  if (seg.id) {
    const idMatch = info.attrStr.match(/\bid\s*=\s*"([^"]*)"/i)
      ?? info.attrStr.match(/\bid\s*=\s*'([^']*)'/i);
    if (!idMatch || idMatch[1].trim().toLowerCase() !== seg.id) {
      return false;
    }
  }
  if (seg.classes.length === 0) return true;
  const m = info.attrStr.match(/\bclass\s*=\s*"([^"]*)"/i)
    ?? info.attrStr.match(/\bclass\s*=\s*'([^']*)'/i);
  if (!m) return false;
  const classList = m[1].toLowerCase().split(/\s+/);
  return seg.classes.every(c => classList.includes(c));
}

function extractElement(html: string, start: number): { outerHtml: string; end: number } | null {
  const info = parseOpenTagAt(html, start);
  if (!info) return null;

  if (VOID_TAGS.has(info.tagName)) {
    return { outerHtml: html.slice(start, info.end + 1), end: info.end + 1 };
  }

  let depth = 1;
  let i = info.end + 1;

  while (i < html.length && depth > 0) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (html[lt + 1] === "/") {
      // Closing tag
      const closeEnd = html.indexOf(">", lt);
      if (closeEnd === -1) break;
      const closeName = html.slice(lt + 2, closeEnd).trim().toLowerCase();
      if (closeName === info.tagName) {
        depth--;
        if (depth === 0) {
          return { outerHtml: html.slice(start, closeEnd + 1), end: closeEnd + 1 };
        }
      }
      i = closeEnd + 1;
    } else {
      const nested = parseOpenTagAt(html, lt);
      if (nested && nested.tagName === info.tagName && !VOID_TAGS.has(nested.tagName)) {
        depth++;
        i = nested.end + 1;
      } else {
        i = lt + 1;
      }
    }
  }

  return null;
}

function replaceBySelector(
  html: string,
  segments: SelectorSegment[],
  segIdx: number,
  replacementNode: string,
): string | null {
  const seg = segments[segIdx];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    const info = parseOpenTagAt(html, lt);
    if (!info) { i = lt + 1; continue; }

    if (!tagMatchesSegment(info, seg)) { i = lt + 1; continue; }

    // Matched current segment
    const element = extractElement(html, lt);
    if (!element) { i = lt + 1; continue; }

    if (segIdx === segments.length - 1) {
      // Target found — replace
      return html.slice(0, lt) + replacementNode + html.slice(element.end);
    }

    // Recurse into element's inner content
    const innerStart = info.end + 1;
    const closingTag = `</${seg.tag}>`;
    const innerEnd = element.end - closingTag.length;
    const inner = html.slice(innerStart, innerEnd);

    const updatedInner = replaceBySelector(inner, segments, segIdx + 1, replacementNode);
    if (updatedInner !== null) {
      const openTag = html.slice(lt, info.end + 1);
      return html.slice(0, lt) + openTag + updatedInner + closingTag + html.slice(element.end);
    }

    // Not found inside this element; try next sibling
    i = element.end;
  }

  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

function replaceOuterHtmlOnce(
  html: string,
  targetOuterHtml: string,
  replacementNode: string,
): string {
  const targetIndex = html.indexOf(targetOuterHtml);
  if (targetIndex !== -1) {
    return (
      html.slice(0, targetIndex) +
      replacementNode +
      html.slice(targetIndex + targetOuterHtml.length)
    );
  }

  const lowerTarget = targetOuterHtml.toLowerCase();
  const lowerHtml = html.toLowerCase();
  const normalizedIndex = lowerHtml.indexOf(lowerTarget);
  if (normalizedIndex === -1) {
    throw new Error("Target element could not be located in the current HTML.");
  }

  return (
    html.slice(0, normalizedIndex) +
    replacementNode +
    html.slice(normalizedIndex + targetOuterHtml.length)
  );
}

export function applyDesignPatch(options: {
  html: string;
  targetOuterHtml: string;
  replacementNode: string;
  selector?: string;
}): string {
  // Selector-based lookup is preferred — immune to outerHTML serialization drift
  if (options.selector) {
    const segments = parseSelector(options.selector);
    const result = replaceBySelector(options.html, segments, 0, options.replacementNode);
    if (result !== null) return result;
  }

  // Fall back to outerHTML string matching
  return replaceOuterHtmlOnce(options.html, options.targetOuterHtml, options.replacementNode);
}

export function patchDesignImageNode(options: {
  html: string;
  selector: string;
  targetOuterHtml: string;
  imageUrl: string;
}): string {
  const src = options.imageUrl.trim();
  if (!src) {
    throw new Error("Image URL is required to patch the selected design node.");
  }

  const srcAttrPattern = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i;
  const replacementNode = srcAttrPattern.test(options.targetOuterHtml)
    ? options.targetOuterHtml.replace(srcAttrPattern, (_match, quoted) => {
        const quote = quoted.startsWith("'") ? "'" : "\"";
        return `src=${quote}${src}${quote}`;
      })
    : options.targetOuterHtml.replace(/<img\b/i, `<img src="${src}"`);

  return applyDesignPatch({
    html: options.html,
    selector: options.selector,
    targetOuterHtml: options.targetOuterHtml,
    replacementNode,
  });
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
    selector: options.selector,
    targetOuterHtml: options.targetOuterHtml,
    replacementNode,
  });

  return {
    replacementNode,
    html,
    rawOutput,
  };
}
