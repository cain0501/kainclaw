import { describe, expect, it } from "vitest";
import { REVIEW_AGENT_TYPE, VERIFICATION_AGENT_TYPE } from "./constants";
import { getBuiltInAgent, getBuiltInAgents } from "./builtInAgents";

describe("builtInAgents registry", () => {
  it("returns the registered built-in agents", () => {
    const agents = getBuiltInAgents();

    expect(agents.map(agent => agent.agentType)).toEqual([
      VERIFICATION_AGENT_TYPE,
      REVIEW_AGENT_TYPE,
    ]);
  });

  it("looks up agents by type", () => {
    expect(getBuiltInAgent(VERIFICATION_AGENT_TYPE)?.agentType).toBe(VERIFICATION_AGENT_TYPE);
    expect(getBuiltInAgent(REVIEW_AGENT_TYPE)?.agentType).toBe(REVIEW_AGENT_TYPE);
    expect(getBuiltInAgent("missing")).toBeUndefined();
  });
});
