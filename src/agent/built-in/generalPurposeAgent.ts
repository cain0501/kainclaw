import { SYSTEM_PROMPT } from "../agentRunner";
import type { BuiltInAgentDefinition } from "./types";

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: "general-purpose",
  whenToUse:
    "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.",
  color: "blue",
  source: "built-in",
  getSystemPrompt: () => SYSTEM_PROMPT,
};
