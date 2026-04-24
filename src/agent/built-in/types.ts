export type BuiltInAgentColor = "red" | "blue";

export type BuiltInAgentDefinition = {
  agentType: string;
  whenToUse: string;
  color?: BuiltInAgentColor;
  background?: boolean;
  disallowedTools?: string[];
  source: "built-in";
  model?: "inherit" | string;
  getSystemPrompt: () => string;
  criticalSystemReminder?: string;
};
