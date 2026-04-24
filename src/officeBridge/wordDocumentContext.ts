import { estimateTextTokens } from "../compact/tokenBudget";

export type WordParagraphSnapshot = {
  id: string;
  text: string;
  style?: string;
  isEmpty: boolean;
};

export type WordDocumentSnapshot = {
  paragraphs: WordParagraphSnapshot[];
  fullText: string;
  charCount: number;
};

export type WordQuestionMode =
  | "summary"
  | "comparison"
  | "fact"
  | "default";

const DEFAULT_SELECTED_PARAGRAPH_LIMIT = 8;
const DEFAULT_SELECTED_CONTEXT_TOKEN_BUDGET = 1500;
const DEFAULT_NEIGHBOR_WINDOW = 1;
const DEFAULT_SECTION_BODY_LIMIT = 2;

export type WordSelectedContext = {
  paragraphs: WordParagraphSnapshot[];
  contextText: string;
  estimatedTokens: number;
  truncated: boolean;
};

function resolveNeighborSelectionStrategy(
  questionMode: WordQuestionMode | undefined,
): { includeNeighbors: boolean; neighborWindow: number } {
  if (questionMode === "summary" || questionMode === "comparison") {
    return {
      includeNeighbors: true,
      neighborWindow: 1,
    };
  }

  return {
    includeNeighbors: false,
    neighborWindow: 0,
  };
}

export function buildWordDocumentSnapshot(
  paragraphs: Array<{ text: string; style?: string }>,
): WordDocumentSnapshot {
  const normalizedParagraphs = paragraphs.map((paragraph, index) => {
    const text = paragraph.text ?? "";
    return {
      id: `p${index}`,
      text,
      style: paragraph.style,
      isEmpty: text.trim().length === 0,
    };
  });

  return {
    paragraphs: normalizedParagraphs,
    fullText: normalizedParagraphs.map(paragraph => paragraph.text).join("\n"),
    charCount: normalizedParagraphs.reduce(
      (total, paragraph) => total + paragraph.text.length,
      0,
    ),
  };
}

export function buildWordDocumentContext(
  snapshot: WordDocumentSnapshot,
): string {
  return snapshot.paragraphs
    .filter(paragraph => !paragraph.isEmpty)
    .map(paragraph => `[${paragraph.id}] ${paragraph.text}`)
    .join("\n");
}

const WORD_PARAGRAPH_CITATION_PATTERN = /\[\s*p\s*0*(\d+)\s*\]/gi;

function createWordParagraphId(rawIndex: string): string {
  return `p${Number.parseInt(rawIndex, 10)}`;
}

function createCanonicalWordParagraphCitation(paragraphId: string): string {
  return `[${paragraphId}]`;
}

export type WordParagraphCitationRef = {
  raw: string;
  paragraphId: string;
  canonical: string;
  index: number;
  wasNormalized: boolean;
};

export function extractWordParagraphCitationRefs(reply: string): WordParagraphCitationRef[] {
  return [...reply.matchAll(WORD_PARAGRAPH_CITATION_PATTERN)].map(match => {
    const paragraphId = createWordParagraphId(match[1] ?? "0");
    const canonical = createCanonicalWordParagraphCitation(paragraphId);
    const raw = match[0] ?? canonical;

    return {
      raw,
      paragraphId,
      canonical,
      index: match.index ?? 0,
      wasNormalized: raw !== canonical,
    };
  });
}

export function normalizeWordReplyParagraphCitations(reply: string): string {
  return reply.replaceAll(WORD_PARAGRAPH_CITATION_PATTERN, (_, rawIndex: string) =>
    createCanonicalWordParagraphCitation(createWordParagraphId(rawIndex)),
  );
}

export function extractWordParagraphCitations(reply: string): string[] {
  return [...new Set(extractWordParagraphCitationRefs(reply).map(match => match.paragraphId))];
}

export type WordReplySegment =
  | { type: "text"; text: string }
  | {
      type: "citation";
      paragraphId: string;
      raw: string;
      isKnown: boolean;
      previewText?: string;
    };

export function buildWordParagraphIndex(
  snapshot: WordDocumentSnapshot,
): Record<string, WordParagraphSnapshot> {
  return Object.fromEntries(
    snapshot.paragraphs.map(paragraph => [paragraph.id, paragraph]),
  );
}

export function splitWordReplyIntoSegments(
  reply: string,
  paragraphIndex?: Record<string, WordParagraphSnapshot>,
): WordReplySegment[] {
  const segments: WordReplySegment[] = [];
  let cursor = 0;

  for (const match of extractWordParagraphCitationRefs(reply)) {
    const index = match.index;
    const raw = match.raw;
    const paragraphId = match.paragraphId;

    if (index > cursor) {
      segments.push({
        type: "text",
        text: reply.slice(cursor, index),
      });
    }

    segments.push({
      type: "citation",
      paragraphId,
      raw,
      isKnown: !!paragraphIndex?.[paragraphId],
      previewText: paragraphIndex?.[paragraphId]?.text,
    });

    cursor = index + raw.length;
  }

  if (cursor < reply.length) {
    segments.push({
      type: "text",
      text: reply.slice(cursor),
    });
  }

  return segments.length > 0
    ? segments
    : [{ type: "text", text: reply }];
}

function normalizeQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function getWordParagraphStyleWeight(style?: string): number {
  const normalizedStyle = (style ?? "").toLowerCase();
  if (!normalizedStyle) {
    return 0;
  }

  if (normalizedStyle.includes("title")) {
    return 4;
  }

  if (normalizedStyle.includes("heading 1")) {
    return 3;
  }

  if (normalizedStyle.includes("heading 2")) {
    return 2;
  }

  if (normalizedStyle.includes("heading")) {
    return 1;
  }

  return 0;
}

function isHeadingLikeParagraph(paragraph: WordParagraphSnapshot): boolean {
  return getWordParagraphStyleWeight(paragraph.style) > 0;
}

export function getWordParagraphRelevanceScore(
  paragraph: WordParagraphSnapshot,
  query: string,
): number {
  const tokens = normalizeQueryTokens(query);
  if (tokens.length === 0 || paragraph.isEmpty) {
    return 0;
  }

  const normalizedText = paragraph.text.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const matchedTokens = tokens.filter(token => normalizedText.includes(token));

  const tokenScore = matchedTokens.length;
  const coverageScore = matchedTokens.length / tokens.length;
  const phraseScore =
    normalizedQuery && normalizedQuery.length >= 4 && normalizedText.includes(normalizedQuery)
      ? 2
      : 0;
  const styleScore = getWordParagraphStyleWeight(paragraph.style);

  return tokenScore + coverageScore + phraseScore + styleScore;
}

function getParagraphNumericIndex(paragraph: WordParagraphSnapshot): number {
  return Number.parseInt(paragraph.id.replace(/^p/, ""), 10);
}

function findParagraphById(
  snapshot: WordDocumentSnapshot,
  paragraphId: string,
): WordParagraphSnapshot | undefined {
  return snapshot.paragraphs.find(paragraph => paragraph.id === paragraphId);
}

function collectNeighborParagraphs(
  snapshot: WordDocumentSnapshot,
  seedParagraphs: WordParagraphSnapshot[],
  neighborWindow: number,
): WordParagraphSnapshot[] {
  const neighbors: WordParagraphSnapshot[] = [];
  const seen = new Set(seedParagraphs.map(paragraph => paragraph.id));

  for (const paragraph of seedParagraphs) {
    const centerIndex = getParagraphNumericIndex(paragraph);
    for (let offset = -neighborWindow; offset <= neighborWindow; offset += 1) {
      if (offset === 0) {
        continue;
      }

      const candidate = findParagraphById(snapshot, `p${centerIndex + offset}`);
      if (!candidate || candidate.isEmpty || seen.has(candidate.id)) {
        continue;
      }

      seen.add(candidate.id);
      neighbors.push(candidate);
    }
  }

  return neighbors.sort((left, right) => getParagraphNumericIndex(left) - getParagraphNumericIndex(right));
}

function collectSameSectionParagraphs(
  snapshot: WordDocumentSnapshot,
  seedParagraphs: WordParagraphSnapshot[],
  maxSectionBodyParagraphs: number,
): WordParagraphSnapshot[] {
  const sectionParagraphs: WordParagraphSnapshot[] = [];
  const seen = new Set(seedParagraphs.map(paragraph => paragraph.id));

  for (const paragraph of seedParagraphs) {
    if (!isHeadingLikeParagraph(paragraph)) {
      continue;
    }

    const centerIndex = getParagraphNumericIndex(paragraph);
    let addedForSection = 0;

    for (let offset = 1; addedForSection < maxSectionBodyParagraphs; offset += 1) {
      const candidate = findParagraphById(snapshot, `p${centerIndex + offset}`);
      if (!candidate) {
        break;
      }

      if (candidate.isEmpty) {
        continue;
      }

      if (isHeadingLikeParagraph(candidate)) {
        break;
      }

      if (seen.has(candidate.id)) {
        continue;
      }

      seen.add(candidate.id);
      sectionParagraphs.push(candidate);
      addedForSection += 1;
    }
  }

  return sectionParagraphs.sort(
    (left, right) => getParagraphNumericIndex(left) - getParagraphNumericIndex(right),
  );
}

export function selectRelevantWordParagraphs(
  snapshot: WordDocumentSnapshot,
  query: string,
  maxParagraphs = DEFAULT_SELECTED_PARAGRAPH_LIMIT,
): WordParagraphSnapshot[] {
  const normalizedLimit = Math.max(1, Math.floor(maxParagraphs));
  const normalizedQuery = normalizeQueryTokens(query);

  const candidates = snapshot.paragraphs.filter(paragraph => !paragraph.isEmpty);
  if (candidates.length <= normalizedLimit || normalizedQuery.length === 0) {
    return candidates.slice(0, normalizedLimit);
  }

  return [...candidates]
    .map(paragraph => ({
      paragraph,
      score: getWordParagraphRelevanceScore(paragraph, query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftIndex = Number.parseInt(left.paragraph.id.replace(/^p/, ""), 10);
      const rightIndex = Number.parseInt(right.paragraph.id.replace(/^p/, ""), 10);
      return leftIndex - rightIndex;
    })
    .slice(0, normalizedLimit)
    .sort((left, right) => {
      const leftIndex = Number.parseInt(left.paragraph.id.replace(/^p/, ""), 10);
      const rightIndex = Number.parseInt(right.paragraph.id.replace(/^p/, ""), 10);
      return leftIndex - rightIndex;
    })
    .map(item => item.paragraph);
}

export function buildSelectedWordDocumentContext(
  snapshot: WordDocumentSnapshot,
  query: string,
  maxParagraphs = DEFAULT_SELECTED_PARAGRAPH_LIMIT,
): string {
  return buildSelectedWordDocumentContextResult(snapshot, query, {
    maxParagraphs,
  }).contextText;
}

export function estimateWordParagraphContextTokens(
  paragraph: WordParagraphSnapshot,
): number {
  return estimateTextTokens(`[${paragraph.id}] ${paragraph.text}`);
}

export function buildSelectedWordDocumentContextResult(
  snapshot: WordDocumentSnapshot,
  query: string,
  options?: {
    maxParagraphs?: number;
    maxTokens?: number;
    includeNeighbors?: boolean;
    neighborWindow?: number;
    questionMode?: WordQuestionMode;
    includeSectionBody?: boolean;
    maxSectionBodyParagraphs?: number;
  },
): WordSelectedContext {
  const maxParagraphs = options?.maxParagraphs ?? DEFAULT_SELECTED_PARAGRAPH_LIMIT;
  const maxTokens = options?.maxTokens ?? DEFAULT_SELECTED_CONTEXT_TOKEN_BUDGET;
  const strategy = resolveNeighborSelectionStrategy(options?.questionMode);
  const includeNeighbors = options?.includeNeighbors ?? strategy.includeNeighbors;
  const neighborWindow = Math.max(
    0,
    Math.floor(options?.neighborWindow ?? strategy.neighborWindow ?? DEFAULT_NEIGHBOR_WINDOW),
  );
  const includeSectionBody =
    options?.includeSectionBody ?? (options?.questionMode === "summary" || options?.questionMode === "comparison");
  const maxSectionBodyParagraphs = Math.max(
    0,
    Math.floor(options?.maxSectionBodyParagraphs ?? DEFAULT_SECTION_BODY_LIMIT),
  );
  const rankedParagraphs = selectRelevantWordParagraphs(
    snapshot,
    query,
    maxParagraphs,
  );
  const candidateParagraphs = [
    ...rankedParagraphs,
    ...(includeSectionBody
      ? collectSameSectionParagraphs(snapshot, rankedParagraphs, maxSectionBodyParagraphs)
      : []),
    ...(includeNeighbors
      ? collectNeighborParagraphs(snapshot, rankedParagraphs, neighborWindow)
      : []),
  ].sort((left, right) => getParagraphNumericIndex(left) - getParagraphNumericIndex(right));

  const selected: WordParagraphSnapshot[] = [];
  let estimatedTokens = 0;
  let truncated = false;
  const selectedIds = new Set<string>();

  for (const paragraph of candidateParagraphs) {
    if (selectedIds.has(paragraph.id)) {
      continue;
    }

    const nextTokens = estimateWordParagraphContextTokens(paragraph);
    if (selected.length > 0 && estimatedTokens + nextTokens > maxTokens) {
      truncated = true;
      continue;
    }

    if (selected.length === 0 && nextTokens > maxTokens) {
      selected.push(paragraph);
      estimatedTokens += nextTokens;
      truncated = rankedParagraphs.length > 1;
      break;
    }

    selected.push(paragraph);
    selectedIds.add(paragraph.id);
    estimatedTokens += nextTokens;

    if (selected.length >= maxParagraphs) {
      truncated = candidateParagraphs.length > selected.length;
      break;
    }
  }

  return {
    paragraphs: selected,
    contextText: selected
      .map(paragraph => `[${paragraph.id}] ${paragraph.text}`)
      .join("\n"),
    estimatedTokens,
    truncated,
  };
}
