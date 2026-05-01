import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import { supportsImageUrlInputs } from "../agent/providers/openAIAdapter";
import { augmentArtifactPrompt } from "./artifactPromptAugmenter";

const DEFAULT_DERIVE_ARTIFACT_PROMPT = "请把这张设计图做成可以点击的产品原型。";

export function providerSupportsArtifactDerivation(
  config: ProviderConfig,
): boolean {
  if (config.type === "claude-cli") {
    return false;
  }

  if (config.type === "anthropic") {
    return true;
  }

  return supportsImageUrlInputs(config);
}

export function buildDeriveArtifactPrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim() || DEFAULT_DERIVE_ARTIFACT_PROMPT;
  const basePrompt = [
    normalizedPrompt,
    "",
    "[Internal derive_artifact instructions]",
    "- Use the attached image as the visual source of truth.",
    "- Convert that image into a single-file HTML prototype with inline CSS and vanilla JavaScript.",
    "- Recreate the layout, hierarchy, spacing, palette, typography, and component structure from the image.",
    "- Preserve the product intent from the user's request while making the result immediately usable as a clickable prototype.",
    "- Do not call tools.",
    "- Do not explain your approach.",
    "- Output the prototype directly.",
  ].join("\n");
  const augmentedPrompt = augmentArtifactPrompt(basePrompt);

  if (augmentedPrompt.includes("<!DOCTYPE html>")) {
    return augmentedPrompt;
  }

  return [
    augmentedPrompt,
    "",
    "[Internal artifact output contract]",
    "- Return only one complete single-file HTML document.",
    "- The very first line must be <!DOCTYPE html>.",
    "- Do not add markdown fences.",
    "- Do not add explanation before or after the HTML.",
  ].join("\n");
}
