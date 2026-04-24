export type PartialCompactDirection = "from" | "up_to";
export const COMPACT_CONTINUATION_PREFIX =
  "This session is being continued from a previous conversation that ran out of context.";
export const COMPACT_CONTINUATION_TRAILER =
  'Continue the conversation from where it left off without asking the user any further questions. Resume directly - do not acknowledge the summary, do not recap what was happening, and do not preface with "I\'ll continue" or similar. Pick up the last task as if the break never happened.';
const COMPACT_TRANSCRIPT_HINT_PREFIX =
  "If you need specific details from before compaction, read the full transcript at:";
const RECENT_MESSAGES_PRESERVED_NOTE =
  "Recent messages are preserved verbatim.";

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use any tools.
- You already have all the context you need in the conversation above.
- Tool calls will be rejected and will waste your only turn.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`;

const DETAILED_ANALYSIS_INSTRUCTION_BASE = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`;

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Analyze the recent messages chronologically. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include a summary of why each file read or edit was important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing.

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.`;

const PARTIAL_COMPACT_PROMPT = `Your task is to create a detailed summary of the RECENT portion of the conversation - the messages that follow earlier retained context. The earlier messages are being kept intact and do NOT need to be summarized. Focus your summary on what was discussed, learned, and accomplished in the recent messages only.

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents from the recent messages
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks discussed recently.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created.
4. Errors and fixes: List errors encountered and how they were fixed.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages from the recent portion that are not tool results.
7. Pending Tasks: Outline any pending tasks from the recent messages.
8. Current Work: Describe precisely what was being worked on immediately before this summary request.
9. Optional Next Step: List the next step related to the most recent work.

Please provide your summary based on the RECENT messages only, following this structure and ensuring precision and thoroughness in your response.`;

const PARTIAL_COMPACT_UP_TO_PROMPT = `Your task is to create a detailed summary of this conversation. This summary will be placed at the start of a continuing session; newer messages that build on this context will follow after your summary. Summarize thoroughly so that someone reading only your summary and then the newer messages can fully understand what happened and continue the work.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents in detail
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created.
4. Errors and fixes: List errors encountered and how they were fixed.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results.
7. Pending Tasks: Outline any pending tasks.
8. Work Completed: Describe what was accomplished by the end of this portion.
9. Context for Continuing Work: Summarize any context, decisions, or state that would be needed to understand and continue the work in subsequent messages.

Please provide your summary following this structure, ensuring precision and thoroughness in your response.`;

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only - an <analysis> block followed by a <summary> block. Tool calls will be rejected and you will fail the task.';

export function getPartialCompactPrompt(
  customInstructions?: string,
  direction: PartialCompactDirection = "from",
): string {
  const template =
    direction === "up_to"
      ? PARTIAL_COMPACT_UP_TO_PROMPT
      : PARTIAL_COMPACT_PROMPT;
  let prompt = NO_TOOLS_PREAMBLE + template;

  if (customInstructions && customInstructions.trim() !== "") {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }

  prompt += NO_TOOLS_TRAILER;
  return prompt;
}

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT;

  if (customInstructions && customInstructions.trim() !== "") {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }

  prompt += NO_TOOLS_TRAILER;
  return prompt;
}

export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary;

  formattedSummary = formattedSummary.replace(
    /<analysis>[\s\S]*?<\/analysis>\s*/g,
    "",
  );

  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    const content = summaryMatch[1] || "";
    formattedSummary = formattedSummary.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    );
  }

  formattedSummary = formattedSummary.replace(/\n\n+/g, "\n\n");
  return formattedSummary.trim();
}

export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions = false,
  transcriptPath?: string,
  recentMessagesPreserved = false,
): string {
  const formattedSummary = formatCompactSummary(summary);

  let baseSummary = `${COMPACT_CONTINUATION_PREFIX} The summary below covers the earlier portion of the conversation.

${formattedSummary}`;

  if (transcriptPath) {
    baseSummary += `\n\n${COMPACT_TRANSCRIPT_HINT_PREFIX} ${transcriptPath}`;
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\n${RECENT_MESSAGES_PRESERVED_NOTE}`;
  }

  if (suppressFollowUpQuestions) {
    return `${baseSummary}
${COMPACT_CONTINUATION_TRAILER}`;
  }

  return baseSummary;
}

export function isCompactUserSummaryMessage(content: string): boolean {
  return content.trimStart().startsWith(COMPACT_CONTINUATION_PREFIX);
}

function splitCompactContinuationInstruction(content: string): {
  body: string;
  continuationInstruction?: string;
} {
  const trimmed = content.trim();
  if (trimmed.endsWith(COMPACT_CONTINUATION_TRAILER)) {
    return {
      body: trimmed.slice(0, -COMPACT_CONTINUATION_TRAILER.length).trimEnd(),
      continuationInstruction: COMPACT_CONTINUATION_TRAILER,
    };
  }

  return {
    body: trimmed,
  };
}

function replaceCompactTranscriptHint(
  body: string,
  transcriptPath?: string,
): string {
  const withoutExistingHints = body
    .replace(
      /\n\nIf you need specific details from before compaction, read the full transcript at:[^\n]*/g,
      "",
    )
    .trimEnd();

  if (!transcriptPath) {
    return withoutExistingHints;
  }

  return `${withoutExistingHints}\n\n${COMPACT_TRANSCRIPT_HINT_PREFIX} ${transcriptPath}`;
}

function extractCompactTranscriptHintPath(body: string): string | undefined {
  const match = body.match(
    /If you need specific details from before compaction, read the full transcript at:\s*([^\n]+)/,
  );
  const transcriptPath = match?.[1]?.trim();
  return transcriptPath ? transcriptPath : undefined;
}

function replaceRecentMessagesPreservedHint(
  body: string,
  recentMessagesPreserved?: boolean,
): string {
  const withoutExistingHint = body
    .replace(/\n\nRecent messages are preserved verbatim\./g, "")
    .trimEnd();

  if (recentMessagesPreserved !== true) {
    return withoutExistingHint;
  }

  return `${withoutExistingHint}\n\n${RECENT_MESSAGES_PRESERVED_NOTE}`;
}

export function mergeCompactUserSummaryMessage(options: {
  existingSummaryMessage: string;
  additionalSummary: string;
  suppressFollowUpQuestions?: boolean;
  transcriptPath?: string;
  recentMessagesPreserved?: boolean;
}): string {
  const existing = splitCompactContinuationInstruction(options.existingSummaryMessage);
  const additionalSummary = formatCompactSummary(options.additionalSummary);
  let mergedBody = `${existing.body}

Additional summary from later messages:

${additionalSummary}`;

  mergedBody = replaceCompactTranscriptHint(
    mergedBody,
    options.transcriptPath ?? extractCompactTranscriptHintPath(existing.body),
  );

  mergedBody = replaceRecentMessagesPreservedHint(
    mergedBody,
    options.recentMessagesPreserved,
  );

  if (options.suppressFollowUpQuestions ?? true) {
    return `${mergedBody}
${existing.continuationInstruction ?? COMPACT_CONTINUATION_TRAILER}`;
  }

  return mergedBody;
}
