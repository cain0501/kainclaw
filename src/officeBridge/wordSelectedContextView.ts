import type { WordParagraphSnapshot, WordSelectedContext } from "./wordDocumentContext";

const DEFAULT_PREVIEW_LIMIT = 120;

export function truncateWordParagraphPreview(
  text: string,
  maxChars = DEFAULT_PREVIEW_LIMIT,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function formatWordSelectedContextSummary(
  selectedContext: WordSelectedContext | null,
): string {
  if (!selectedContext || selectedContext.paragraphs.length === 0) {
    return "No scoped context selected yet";
  }

  return `${selectedContext.paragraphs.length} paragraphs · ~${selectedContext.estimatedTokens} tokens${selectedContext.truncated ? " · truncated" : ""}`;
}

export function mapWordSelectedContextPreviews(
  paragraphs: WordParagraphSnapshot[],
): Array<{ id: string; preview: string }> {
  return paragraphs.map(paragraph => ({
    id: paragraph.id,
    preview: truncateWordParagraphPreview(paragraph.text),
  }));
}

export function formatWordCandidateParagraphSummary(
  paragraphs: WordParagraphSnapshot[],
  maxCandidates = 3,
): string {
  return mapWordSelectedContextPreviews(
    paragraphs.slice(0, Math.max(1, Math.floor(maxCandidates))),
  )
    .map(item => `[${item.id}] ${item.preview}`)
    .join("; ");
}
