import { describe, expect, it } from "vitest";
import { REVIEW_AGENT } from "./reviewAgent";
import { VERIFICATION_AGENT } from "./verificationAgent";

describe("built-in agent definitions", () => {
  it("marks review and verification agents as background built-ins", () => {
    expect(REVIEW_AGENT.background).toBe(true);
    expect(REVIEW_AGENT.source).toBe("built-in");
    expect(VERIFICATION_AGENT.background).toBe(true);
    expect(VERIFICATION_AGENT.source).toBe("built-in");
  });

  it("keeps dangerous tools disallowed for both review and verification", () => {
    for (const toolName of ["spawn_agent", "write_file", "replace_in_file", "RunReview"]) {
      expect(REVIEW_AGENT.disallowedTools).toContain(toolName);
      expect(VERIFICATION_AGENT.disallowedTools).toContain(toolName);
    }
  });

  it("exposes the expected prompt contracts", () => {
    expect(REVIEW_AGENT.getSystemPrompt()).toContain("Findings must come first");
    expect(REVIEW_AGENT.criticalSystemReminder).toContain("REVIEW-ONLY");

    expect(VERIFICATION_AGENT.getSystemPrompt()).toContain("VERDICT: PASS");
    expect(VERIFICATION_AGENT.getSystemPrompt()).toContain(
      "/verify` is for a concrete implementation/change request",
    );
    expect(VERIFICATION_AGENT.getSystemPrompt()).toContain(
      "The `Output observed` section must contain only the raw command output",
    );
    expect(VERIFICATION_AGENT.getSystemPrompt()).toContain(
      "Always use triple-tilde fences (`~~~`)",
    );
    expect(VERIFICATION_AGENT.getSystemPrompt()).toContain(
      "Do not use triple-backtick fences",
    );
    expect(VERIFICATION_AGENT.criticalSystemReminder).toContain("VERIFICATION-ONLY");
  });
});
