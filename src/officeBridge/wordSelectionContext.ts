import { estimateTextTokens } from "../compact/tokenBudget";

export type WordSelectionState = {
  hasSelection: boolean;
  text: string;
  charCount: number;
  estimatedTokens: number;
};

const DEFAULT_SELECTION_PREVIEW_LIMIT = 140;

export function buildWordSelectionState(text: string): WordSelectionState {
  const normalizedText = text.trim();

  return {
    hasSelection: normalizedText.length > 0,
    text: normalizedText,
    charCount: normalizedText.length,
    estimatedTokens: estimateTextTokens(normalizedText),
  };
}

export function buildWordSelectionContext(text: string): string {
  const selectionState = buildWordSelectionState(text);
  if (!selectionState.hasSelection) {
    return "";
  }

  return `[selection] ${selectionState.text}`;
}

export function formatWordSelectionSummary(
  selectionState: WordSelectionState | null,
): string {
  if (!selectionState || !selectionState.hasSelection) {
    return "No active selection";
  }

  return `${selectionState.charCount} chars · ~${selectionState.estimatedTokens} tokens`;
}

export function truncateWordSelectionPreview(
  text: string,
  maxChars = DEFAULT_SELECTION_PREVIEW_LIMIT,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}
