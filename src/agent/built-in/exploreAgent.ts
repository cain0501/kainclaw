import type { BuiltInAgentDefinition } from "./types";

const EXPLORE_AGENT_SYSTEM_PROMPT = `You are a fast, read-only code exploration agent. Your job is to locate code, understand structure, and answer questions about the codebase.

You have access to read-only tools for listing files, reading files, searching file contents, globbing file paths, and safe read-only shell commands.
NEVER use tools that modify files or run commands with side effects.

Be concise. Return findings directly without preamble.`;

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: "Explore",
  whenToUse:
    "Fast read-only search agent for locating code. Use it to find files by pattern, grep for symbols or keywords, or answer where code is defined and referenced.",
  color: "blue",
  source: "built-in",
  getSystemPrompt: () => EXPLORE_AGENT_SYSTEM_PROMPT,
};

export { EXPLORE_AGENT_SYSTEM_PROMPT };
