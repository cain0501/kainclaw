import {
  type MemoryManifestEntry,
  formatMemoryManifest,
} from "./paths";

export type AutoMemoryPromptOptions = {
  memoryDir: string;
  entrypointContent: string;
};

export function buildAutoMemorySystemPrompt(
  baseSystemPrompt: string,
  options: AutoMemoryPromptOptions,
): string {
  const memoryIndexSection = options.entrypointContent.trim()
    ? options.entrypointContent.trim()
    : "Your MEMORY.md index is currently empty.";

  const memoryInstructions = `# Memory

You have a persistent, file-based memory system for this project at \`${options.memoryDir}\`.
This memory is managed automatically in the background after completed turns.

Use this memory when it is relevant, or when the user explicitly asks you to check, recall, or remember something from prior work.
If the user says to ignore or not use memory, proceed as if the memory index were empty.
Memory can become stale over time. Before relying on a remembered file path, function name, flag, or current project state, verify it against the current codebase.

## MEMORY.md
${memoryIndexSection}`;

  return `${baseSystemPrompt}\n\n${memoryInstructions}`;
}

export function buildAutoMemoryExtractionSystemPrompt(): string {
  return [
    "You are the background auto-memory extraction agent for Cain Claude.",
    "Your only job is to convert durable information from the recent conversation into structured memory suggestions.",
    "Return JSON only.",
    "Do not include markdown fences, prose, explanations, or commentary outside the JSON object.",
  ].join("\n");
}

export function buildAutoMemoryExtractionPrompt(options: {
  existingManifest: MemoryManifestEntry[];
  newMessageCount: number;
  todayIsoDate: string;
}): string {
  const manifest = formatMemoryManifest(options.existingManifest);
  const manifestSection = manifest
    ? `## Existing memory files\n${manifest}\n\nPrefer updating an existing topic over creating a duplicate.`
    : "## Existing memory files\nNo memory topic files exist yet.";

  return [
    `Analyze the most recent ~${options.newMessageCount} messages above and extract only durable memory worth keeping for future conversations.`,
    `Today's date is ${options.todayIsoDate}. Convert relative dates into absolute dates when they matter.`,
    "",
    "Valid memory types:",
    "- user: durable information about the user's role, goals, expertise, or collaboration preferences",
    "- feedback: guidance about how to work with this user or project in future conversations",
    "- project: non-derivable project context such as deadlines, incidents, constraints, or reasons behind work",
    "- reference: pointers to external systems, dashboards, trackers, or resources",
    "",
    "Do NOT save:",
    "- code patterns, architecture, file paths, project structure, or git history",
    "- temporary task state, current diffs, or details useful only in this one conversation",
    "- anything already obvious from reading the repo",
    "",
    "Return a JSON object with this exact shape:",
    `{"memories":[{"slug":"stable-file-name.md","name":"Short title","description":"One-line description","type":"user|feedback|project|reference","hook":"One-line MEMORY.md hook","body":"Markdown body"}]}`,
    "",
    "Rules:",
    "- Return at most 3 memories",
    "- If nothing durable should be saved, return {\"memories\":[]}",
    "- Use stable kebab-case .md file names in slug",
    "- For feedback and project memories, include a 'Why:' line and a 'How to apply:' line when they add useful context",
    "- Keep description and hook concise and specific",
    "",
    manifestSection,
  ].join("\n");
}
