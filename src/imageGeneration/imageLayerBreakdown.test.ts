import { describe, expect, it } from "vitest";

import { buildImageLayerBreakdownPrompt } from "./imageLayerBreakdown";

describe("imageLayerBreakdown", () => {
  it("builds a scoped Midtai layer breakdown prompt", () => {
    const prompt = buildImageLayerBreakdownPrompt("prepare product poster edits");

    expect(prompt.displayPrompt).toContain("Smart layer breakdown for Midtai");
    expect(prompt.displayPrompt).toContain("prepare product poster edits");
    expect(prompt.executionPrompt).toContain("not a PSD");
    expect(prompt.executionPrompt).toContain("not separate transparent layers");
    expect(prompt.executionPrompt).toContain("local-edit notes");
  });

  it("uses a stable default intent when the caller leaves it blank", () => {
    const prompt = buildImageLayerBreakdownPrompt("   ");

    expect(prompt.displayPrompt).toContain("analyze this image for Midtai design editing");
  });
});
