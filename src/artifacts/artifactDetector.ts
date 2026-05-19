import { randomUUID } from "node:crypto";
import {
  DEFAULT_ARTIFACT_TITLES,
  type ArtifactObject,
  type ArtifactType,
} from "./artifactObject";

const MERMAID_START_PATTERNS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "gitGraph",
  "quadrantChart",
  "requirementDiagram",
  "C4Context",
  "C4Container",
  "C4Component",
  "xychart-beta",
  "sankey-beta",
];

type FencedBlock = {
  language?: string;
  content: string;
  startLine: number;
  endLine: number;
};

export type ArtifactDetectionOptions = {
  id?: string;
  now?: number;
  sourceMessageId?: string;
};

export type UnwrappedOuterFence =
  | { language?: string; content: string }
  | null;

function normalizeFenceLanguage(language: string | undefined): string | undefined {
  const normalized = language?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function countLines(content: string): number {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFencedBlocks(text: string): FencedBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: FencedBlock[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const openingMatch = lines[lineIndex]?.match(/^\s*(```|~~~)([^\s`~]*)?\s*$/);
    if (!openingMatch) {
      continue;
    }

    const fence = openingMatch[1];
    const closingPattern = new RegExp(`^\\s*${escapeRegExp(fence)}\\s*$`);

    for (let closingIndex = lineIndex + 1; closingIndex < lines.length; closingIndex += 1) {
      if (!closingPattern.test(lines[closingIndex] ?? "")) {
        continue;
      }

      blocks.push({
        language: normalizeFenceLanguage(openingMatch[2]),
        content: lines.slice(lineIndex + 1, closingIndex).join("\n").trim(),
        startLine: lineIndex,
        endLine: closingIndex,
      });
      lineIndex = closingIndex;
      break;
    }
  }

  return blocks;
}

function isSingleOuterFence(text: string, block: FencedBlock): boolean {
  const lines = text.split(/\r?\n/);
  let firstContentLine = 0;
  while (firstContentLine < lines.length && lines[firstContentLine]?.trim() === "") {
    firstContentLine += 1;
  }

  let lastContentLine = lines.length - 1;
  while (lastContentLine >= 0 && lines[lastContentLine]?.trim() === "") {
    lastContentLine -= 1;
  }

  if (block.startLine !== firstContentLine || block.endLine !== lastContentLine) {
    return false;
  }

  return !/^\s*(```|~~~)/m.test(block.content);
}

function findCodeFenceBlock(text: string): FencedBlock | null {
  return findFencedBlocks(text)[0] ?? null;
}

function looksLikeHtml(content: string): boolean {
  return /^(<!DOCTYPE html>|<html\b)/i.test(content.trim());
}

function looksLikeSvg(content: string): boolean {
  const trimmed = content.trim();
  return /^<svg\b/i.test(trimmed) || /xmlns\s*=\s*["'][^"']*svg[^"']*["']/i.test(trimmed);
}

function looksLikeMermaid(content: string): boolean {
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);

  if (!firstNonEmptyLine) {
    return false;
  }

  return MERMAID_START_PATTERNS.some(pattern =>
    firstNonEmptyLine.startsWith(pattern),
  );
}

function extractHtmlTitle(content: string): string {
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const extractedTitle = titleMatch?.[1]?.trim();
  return extractedTitle || DEFAULT_ARTIFACT_TITLES.html;
}

function extractSvgTitle(content: string): string {
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const extractedTitle = titleMatch?.[1]?.trim();
  return extractedTitle || DEFAULT_ARTIFACT_TITLES.svg;
}

function formatCodeTitle(language: string | undefined): string {
  if (!language) {
    return DEFAULT_ARTIFACT_TITLES.code;
  }

  const knownTitles: Record<string, string> = {
    python: "Python 代码",
    typescript: "TypeScript 代码",
    javascript: "JavaScript 代码",
  };

  return knownTitles[language] ?? DEFAULT_ARTIFACT_TITLES.code;
}

function buildArtifact(options: {
  type: ArtifactType;
  content: string;
  title: string;
  language?: string;
  id?: string;
  now?: number;
  sourceMessageId?: string;
}): ArtifactObject {
  const trimmedContent = options.content.trim();
  const metadata: ArtifactObject["metadata"] = {
    lineCount: countLines(trimmedContent),
  };

  if (options.type === "code") {
    metadata.language = options.language;
  }

  return {
    id: options.id ?? randomUUID(),
    type: options.type,
    content: trimmedContent,
    ...(options.sourceMessageId ? { sourceMessageId: options.sourceMessageId } : {}),
    title: options.title,
    createdAt: options.now ?? Date.now(),
    metadata,
  };
}

export function unwrapSingleOuterFence(text: string): UnwrappedOuterFence {
  const block = findCodeFenceBlock(text);
  if (!block || !isSingleOuterFence(text, block)) {
    return null;
  }

  return {
    language: block.language,
    content: block.content,
  };
}

export function detectArtifact(
  rawText: string,
  options: ArtifactDetectionOptions = {},
): ArtifactObject | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const wrappedArtifactMatch = trimmed.match(
    /^<artifact\b([^>]*)>([\s\S]*?)<\/artifact>$/i,
  );
  if (wrappedArtifactMatch) {
    const attrs = wrappedArtifactMatch[1] ?? "";
    const body = (wrappedArtifactMatch[2] ?? "").trim();
    const type = attrs.match(/\btype="([^"]+)"/i)?.[1]?.trim().toLowerCase();
    const title = attrs.match(/\btitle="([^"]+)"/i)?.[1]?.trim();

    if (type === "text/html" && looksLikeHtml(body)) {
      return buildArtifact({
        type: "html",
        content: body,
        title: title || extractHtmlTitle(body),
        ...options,
      });
    }

    if (type === "image/svg+xml" && looksLikeSvg(body)) {
      return buildArtifact({
        type: "svg",
        content: body,
        title: title || extractSvgTitle(body),
        ...options,
      });
    }
  }

  const unwrapped = unwrapSingleOuterFence(trimmed);
  if (unwrapped?.language === "markdown") {
    return null;
  }

  if (unwrapped?.language === "mermaid" && looksLikeMermaid(unwrapped.content)) {
    return buildArtifact({
      type: "mermaid",
      content: unwrapped.content,
      title: DEFAULT_ARTIFACT_TITLES.mermaid,
      ...options,
    });
  }

  const mermaidBlock = findFencedBlocks(trimmed)
    .find(block => block.language === "mermaid" && looksLikeMermaid(block.content));
  if (mermaidBlock) {
    return buildArtifact({
      type: "mermaid",
      content: mermaidBlock.content,
      title: DEFAULT_ARTIFACT_TITLES.mermaid,
      ...options,
    });
  }

  const fencedHtmlBlock = findFencedBlocks(trimmed)
    .find(block => block.language === "html" && looksLikeHtml(block.content));
  if (fencedHtmlBlock) {
    return buildArtifact({
      type: "html",
      content: fencedHtmlBlock.content,
      title: extractHtmlTitle(fencedHtmlBlock.content),
      ...options,
    });
  }

  const fencedSvgBlock = findFencedBlocks(trimmed)
    .find(block => block.language === "svg" && looksLikeSvg(block.content));
  if (fencedSvgBlock) {
    return buildArtifact({
      type: "svg",
      content: fencedSvgBlock.content,
      title: extractSvgTitle(fencedSvgBlock.content),
      ...options,
    });
  }

  const contentToInspect =
    unwrapped?.language === "html" || unwrapped?.language === "svg"
      ? unwrapped.content
      : trimmed;

  if (looksLikeHtml(contentToInspect)) {
    return buildArtifact({
      type: "html",
      content: contentToInspect,
      title: extractHtmlTitle(contentToInspect),
      ...options,
    });
  }

  if (looksLikeSvg(contentToInspect)) {
    return buildArtifact({
      type: "svg",
      content: contentToInspect,
      title: extractSvgTitle(contentToInspect),
      ...options,
    });
  }

  const codeBlock = findCodeFenceBlock(trimmed);
  if (codeBlock && codeBlock.language !== "markdown" && isSingleOuterFence(trimmed, codeBlock)) {
    return buildArtifact({
      type: "code",
      content: codeBlock.content,
      title: formatCodeTitle(codeBlock.language),
      language: codeBlock.language,
      ...options,
    });
  }

  return null;
}
