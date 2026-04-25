import type { NormalizedMessage } from "../agent/providers/IProviderAdapter";

const SHORTHAND_START_RE = /^\s*\+(\d+(?:\.\d+)?)\s*(k|m|b)\b/i;
const SHORTHAND_END_RE = /\s\+(\d+(?:\.\d+)?)\s*(k|m|b)\s*[.!?]?\s*$/i;
const VERBOSE_RE = /\b(?:use|spend)\s+(\d+(?:\.\d+)?)\s*(k|m|b)\s*tokens?\b/i;
const VERBOSE_RE_G = new RegExp(VERBOSE_RE.source, "gi");

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

type ConversationMessage = Extract<NormalizedMessage, { role: "user" | "assistant" }>;

const MEDIA_ATTACHMENT_TOKEN_ESTIMATE = 2_000;

function stringifyForTokenEstimation(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function isMediaAttachmentMimeType(mimeType: string): boolean {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  return (
    normalizedMimeType.startsWith("image/") ||
    normalizedMimeType === "application/pdf" ||
    normalizedMimeType.startsWith("application/vnd.")
  );
}

function estimateAttachmentPayloadTokens(
  attachments: NonNullable<
    Extract<NormalizedMessage, { role: "user" }>["attachments"]
  >,
): number {
  let totalTokens = 0;

  for (const attachment of attachments) {
    if (isMediaAttachmentMimeType(attachment.mimeType)) {
      totalTokens += MEDIA_ATTACHMENT_TOKEN_ESTIMATE;
      continue;
    }

    totalTokens += roughTokenCountEstimation(attachment.data);
    totalTokens += roughTokenCountEstimation(`data:${attachment.mimeType};base64,`);
  }

  return totalTokens;
}

function parseBudgetMatch(value: string, suffix: string): number {
  return parseFloat(value) * MULTIPLIERS[suffix.toLowerCase()]!;
}

export function parseTokenBudget(text: string): number | null {
  const startMatch = text.match(SHORTHAND_START_RE);
  if (startMatch) {
    return parseBudgetMatch(startMatch[1]!, startMatch[2]!);
  }

  const endMatch = text.match(SHORTHAND_END_RE);
  if (endMatch) {
    return parseBudgetMatch(endMatch[1]!, endMatch[2]!);
  }

  const verboseMatch = text.match(VERBOSE_RE);
  if (verboseMatch) {
    return parseBudgetMatch(verboseMatch[1]!, verboseMatch[2]!);
  }

  return null;
}

export function findTokenBudgetPositions(
  text: string,
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];

  const startMatch = text.match(SHORTHAND_START_RE);
  if (startMatch) {
    const offset =
      startMatch.index! +
      startMatch[0].length -
      startMatch[0].trimStart().length;
    positions.push({
      start: offset,
      end: startMatch.index! + startMatch[0].length,
    });
  }

  const endMatch = text.match(SHORTHAND_END_RE);
  if (endMatch) {
    const endStart = endMatch.index! + 1;
    const alreadyCovered = positions.some(
      position => endStart >= position.start && endStart < position.end,
    );
    if (!alreadyCovered) {
      positions.push({
        start: endStart,
        end: endMatch.index! + endMatch[0].length,
      });
    }
  }

  for (const match of text.matchAll(VERBOSE_RE_G)) {
    positions.push({
      start: match.index!,
      end: match.index! + match[0].length,
    });
  }

  return positions;
}

export function getBudgetContinuationMessage(
  pct: number,
  turnTokens: number,
  budget: number,
): string {
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat("en-US").format(value);

  return `Stopped at ${pct}% of token target (${formatNumber(turnTokens)} / ${formatNumber(budget)}). Keep working - do not summarize.`;
}

export function roughTokenCountEstimation(
  content: string,
  bytesPerToken = 4,
): number {
  if (!content) {
    return 0;
  }

  return Math.round(content.length / bytesPerToken);
}

export function bytesPerTokenForFileType(fileExtension: string): number {
  switch (fileExtension.trim().toLowerCase()) {
    case "json":
    case "jsonl":
    case "jsonc":
      return 2;
    default:
      return 4;
  }
}

export function roughTokenCountEstimationForFileType(
  content: string,
  fileExtension: string,
): number {
  return roughTokenCountEstimation(
    content,
    bytesPerTokenForFileType(fileExtension),
  );
}

export function estimateTextTokens(text: string): number {
  return roughTokenCountEstimation(text);
}

export function estimateMessageTokens(messages: ConversationMessage[]): number {
  let totalTokens = 0;

  for (const message of messages) {
    totalTokens += estimateTextTokens(message.content);
    if (message.role === "assistant" && message.toolCalls?.length) {
      for (const toolCall of message.toolCalls) {
        totalTokens += roughTokenCountEstimation(
          toolCall.name + stringifyForTokenEstimation(toolCall.input ?? {}),
        );
      }
    }
    if (message.role === "user" && message.attachments?.length) {
      totalTokens += estimateAttachmentPayloadTokens(message.attachments);
    }
  }

  return totalTokens;
}
