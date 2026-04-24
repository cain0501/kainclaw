import { describe, expect, it } from "vitest";
import {
  buildPendingPlanVerificationSystemPrompt,
  extractVerificationVerdict,
} from "./prompt";

describe("verification prompt helpers", () => {
  it("extracts PASS/FAIL/PARTIAL verdicts case-insensitively", () => {
    expect(extractVerificationVerdict("VERDICT: PASS")).toBe("PASS");
    expect(extractVerificationVerdict("verdict: fail")).toBe("FAIL");
    expect(extractVerificationVerdict("Verdict: partial")).toBe("PARTIAL");
  });

  it("returns null when no verdict is present", () => {
    expect(extractVerificationVerdict("No final verdict yet.")).toBeNull();
  });

  it("appends the pending plan verification reminder to the base prompt", () => {
    const result = buildPendingPlanVerificationSystemPrompt("Base prompt", {
      planFilePath: ".omx/plans/test.md",
      turnsSinceApproval: 12,
    });

    expect(result).toContain("Base prompt");
    expect(result).toContain(".omx/plans/test.md");
    expect(result).toContain("12 user turns");
    expect(result).toContain("VerifyPlanExecution");
    expect(result).toContain("RunVerification");
  });
});
