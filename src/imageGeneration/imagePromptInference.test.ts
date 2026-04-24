import { describe, expect, it, vi } from "vitest";
import type { IProviderAdapter, ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT,
  VISIBLE_IMAGE_PROMPT_PAIR_SYSTEM_PROMPT,
  inferPromptFromReferenceImages,
  inferVisiblePromptPairFromReferenceImages,
  providerSupportsImagePromptInference,
} from "./imagePromptInference";

describe("imagePromptInference", () => {
  it("recognizes which provider configs support image prompt inference", () => {
    expect(providerSupportsImagePromptInference({
      type: "anthropic",
      apiKey: "secret",
      model: "claude-sonnet-4-6",
    } satisfies ProviderConfig)).toBe(true);
    expect(providerSupportsImagePromptInference({
      type: "openai",
      apiKey: "secret",
      model: "gpt-4o",
    } satisfies ProviderConfig)).toBe(true);
    expect(providerSupportsImagePromptInference({
      type: "openai-compatible",
      apiKey: "secret",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
    } satisfies ProviderConfig)).toBe(false);
    expect(providerSupportsImagePromptInference({
      type: "claude-cli",
      model: "sonnet",
    } satisfies ProviderConfig)).toBe(false);
  });

  it("asks the provider for one prompt using all reference images", async () => {
    const provider: IProviderAdapter = {
      runStep: vi.fn().mockResolvedValue({
        text: "Prompt: cinematic floral portrait, warm rim light, editorial fashion, shallow depth of field",
        toolCalls: [],
        done: true,
      }),
    };

    await expect(inferPromptFromReferenceImages({
      provider,
      referenceImages: [
        {
          dataUrl: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
          name: "a.png",
        },
        {
          dataUrl: "data:image/png;base64,d29ybGQ=",
          mimeType: "image/png",
          name: "b.png",
        },
      ],
    })).resolves.toBe(
      "cinematic floral portrait, warm rim light, editorial fashion, shallow depth of field",
    );

    expect(provider.runStep).toHaveBeenCalledWith(
      [{
        role: "user",
        content: expect.stringContaining("Reverse engineer"),
        attachments: [
          { data: "aGVsbG8=", mimeType: "image/png" },
          { data: "d29ybGQ=", mimeType: "image/png" },
        ],
      }],
      [],
      expect.any(Function),
      undefined,
    );
    expect(IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT).toContain("Return only the final prompt text.");
  });

  it("returns user-visible bilingual prompts for prompt library surfaces", async () => {
    const provider: IProviderAdapter = {
      runStep: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          zhPrompt: "浪漫湖畔婚礼肖像，白色花艺更密，背景真实自然，柔和日光，婚纱细节清晰。",
          enPrompt: "Romantic lakeside bridal portrait, denser white floral styling, realistic natural background, soft daylight, crisp gown details.",
        }),
        toolCalls: [],
        done: true,
      }),
    };

    await expect(inferVisiblePromptPairFromReferenceImages({
      provider,
      referenceImages: [{
        dataUrl: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
        name: "a.png",
      }],
    })).resolves.toEqual({
      zhPrompt: "浪漫湖畔婚礼肖像，白色花艺更密，背景真实自然，柔和日光，婚纱细节清晰。",
      enPrompt: "Romantic lakeside bridal portrait, denser white floral styling, realistic natural background, soft daylight, crisp gown details.",
    });

    expect(VISIBLE_IMAGE_PROMPT_PAIR_SYSTEM_PROMPT).toContain("zhPrompt");
  });
});
