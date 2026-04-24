import type { BuiltInAgentDefinition } from "./built-in/types";
import { REVIEW_AGENT } from "./built-in/reviewAgent";
import { VERIFICATION_AGENT } from "./built-in/verificationAgent";

const BUILT_IN_AGENTS: BuiltInAgentDefinition[] = [VERIFICATION_AGENT, REVIEW_AGENT];

export function getBuiltInAgents(): BuiltInAgentDefinition[] {
  return [...BUILT_IN_AGENTS];
}

export function getBuiltInAgent(
  agentType: string,
): BuiltInAgentDefinition | undefined {
  return BUILT_IN_AGENTS.find(agent => agent.agentType === agentType);
}
