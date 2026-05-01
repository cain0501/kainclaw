import { describe, expect, it } from "vitest";
import {
  buildDeriveArtifactPrompt,
  providerSupportsArtifactDerivation,
} from "./deriveArtifact";

describe("deriveArtifact", () => {
  it("accepts vision-capable provider configs", () => {
    expect(providerSupportsArtifactDerivation({
      type: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
    })).toBe(true);

    expect(providerSupportsArtifactDerivation({
      type: "openai",
      apiKey: "test-key",
      model: "gpt-4.1",
    })).toBe(true);
  });

  it("rejects non-vision provider configs", () => {
    expect(providerSupportsArtifactDerivation({
      type: "claude-cli",
      model: "claude-sonnet-4-6",
    })).toBe(false);

    expect(providerSupportsArtifactDerivation({
      type: "openai-compatible",
      apiKey: "test-key",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
    })).toBe(false);
  });

  it("builds an html-only derive prompt", () => {
    const prompt = buildDeriveArtifactPrompt(
      "Turn this design into a clickable HTML prototype",
    );

    expect(prompt).toContain("Use the attached image as the visual source of truth.");
    expect(prompt).toContain("single-file HTML prototype");
    expect(prompt).toContain("<!DOCTYPE html>");
    expect(prompt).toContain("Do not call tools.");
  });
});
