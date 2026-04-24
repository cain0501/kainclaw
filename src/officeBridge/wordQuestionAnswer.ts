import {
  extractWordParagraphCitationRefs,
  extractWordParagraphCitations,
  normalizeWordReplyParagraphCitations,
  type WordParagraphSnapshot,
  type WordQuestionMode,
} from "./wordDocumentContext";
import { formatWordCandidateParagraphSummary } from "./wordSelectedContextView";

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase();
}

export function detectWordQuestionMode(question: string): WordQuestionMode {
  const normalizedQuestion = normalizeQuestion(question);

  if (
    /\b(summarize|summary|overview|main points|high level)\b/i.test(normalizedQuestion) ||
    /总结|概括|概要|要点/.test(normalizedQuestion)
  ) {
    return "summary";
  }

  if (
    /\b(compare|difference|different|versus|vs\.?)\b/i.test(normalizedQuestion) ||
    /比较|区别|差异|对比/.test(normalizedQuestion)
  ) {
    return "comparison";
  }

  if (
    /\b(what|when|where|who|which|how much|how many)\b/i.test(normalizedQuestion) ||
    /什么|何时|哪里|谁|哪个|多少/.test(normalizedQuestion)
  ) {
    return "fact";
  }

  return "default";
}

export function buildWordQuestionPrompt(options: {
  question: string;
  documentContext: string;
  selectionContext?: string;
}): string {
  const trimmedQuestion = options.question.trim();
  const trimmedContext = options.documentContext.trim();
  const trimmedSelection = options.selectionContext?.trim() ?? "";

  if (!trimmedContext && !trimmedSelection) {
    return trimmedQuestion;
  }

  const questionMode = detectWordQuestionMode(trimmedQuestion);
  const modeSpecificRules =
    questionMode === "summary"
      ? [
          "- For summary-style questions, cite the paragraph ids that support each major point.",
          "- If you summarize multiple sections, spread citations across the answer instead of citing only once at the end.",
        ]
      : questionMode === "comparison"
        ? [
            "- For comparison questions, cite both sides of the comparison with paragraph ids whenever possible.",
            "- If the compared items come from different paragraphs, include citations for each side in the same sentence or bullet.",
          ]
        : questionMode === "fact"
          ? [
              "- For fact lookup questions, cite the single best supporting paragraph id next to the claim.",
            ]
          : [
              "- Cite the paragraph ids that support the answer close to the relevant claim.",
            ];
  const scopeSpecificRules = trimmedSelection
    ? [
        "- Treat the selection as the primary focus of the question.",
        "- Use the document context only as supporting evidence or surrounding context for the selection.",
        "- When you rely on document context, keep paragraph citations inline near the supported claim.",
      ]
    : [];

  const promptSections = [
    trimmedQuestion,
  ];

  if (trimmedSelection) {
    promptSections.push(
      "",
      "Selection Focus:",
      trimmedSelection,
    );
  }

  if (trimmedContext) {
    promptSections.push(
      "",
      trimmedSelection ? "Relevant Document Context:" : "Document Context:",
      trimmedContext,
    );
  }

  promptSections.push(
    "",
    "Answer rules:",
    trimmedSelection
      ? "- Base the answer only on the selection focus and document context above."
      : "- Base the answer only on the document context above.",
    "- Cite the supporting paragraph ids inline using the exact form [pN].",
    "- If the answer needs multiple sources, cite multiple paragraph ids.",
    "- Do not invent citations that are not present in the document context.",
    ...scopeSpecificRules,
    ...modeSpecificRules,
  );

  return promptSections.join("\n");
}

export function finalizeWordAssistantReply(options: {
  reply: string;
  candidateParagraphs?: WordParagraphSnapshot[];
  availableParagraphs?: WordParagraphSnapshot[];
}): string {
  const rawReply = options.reply.trim();
  const trimmedReply = normalizeWordReplyParagraphCitations(rawReply);
  const citationRefs = extractWordParagraphCitationRefs(rawReply);
  const candidateParagraphIds = (options.candidateParagraphs ?? [])
    .map(paragraph => paragraph.id)
    .slice(0, 3);
  const availableParagraphIds = new Set(
    (options.availableParagraphs ?? []).map(paragraph => paragraph.id),
  );

  if (!trimmedReply) {
    return "[No assistant reply]";
  }

  const citations = extractWordParagraphCitations(trimmedReply);
  if (citations.length > 0) {
    const unresolvedRefs = citationRefs.filter(
      citation =>
        availableParagraphIds.size > 0 && !availableParagraphIds.has(citation.paragraphId),
    );
    if (unresolvedRefs.length === 0) {
      return trimmedReply;
    }

    const unresolvedByParagraphId = new Map<string, string>();
    for (const ref of unresolvedRefs) {
      if (unresolvedByParagraphId.has(ref.paragraphId)) {
        continue;
      }

      unresolvedByParagraphId.set(
        ref.paragraphId,
        ref.wasNormalized ? `${ref.raw} -> ${ref.canonical}` : ref.canonical,
      );
    }
    const unresolved = [...unresolvedByParagraphId.values()];

    return `${trimmedReply}\n\n[Some paragraph citations could not be resolved in the current document snapshot: ${unresolved.join(", ")}.]`;
  }

  const candidateSuffix =
    candidateParagraphIds.length > 0
      ? ` Possible relevant paragraphs: ${formatWordCandidateParagraphSummary(
          options.candidateParagraphs ?? [],
          3,
        )}.`
      : "";

  return `${trimmedReply}\n\n[No paragraph citations were provided in this reply.${candidateSuffix}]`;
}

export function getWordCitationCandidateIds(
  paragraphs: WordParagraphSnapshot[],
  maxCandidates = 3,
): string[] {
  return paragraphs
    .slice(0, Math.max(1, Math.floor(maxCandidates)))
    .map(paragraph => paragraph.id);
}
