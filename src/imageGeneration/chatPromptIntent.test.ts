import { describe, expect, it } from "vitest";
import { determineChatPromptIntent } from "./chatPromptIntent";

describe("chatPromptIntent", () => {
  it("routes strong generation requests to image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "生成一张浪漫湖畔婚礼肖像",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("image_generate");
  });

  it("treats attachment-backed prompts as image generation by default", () => {
    expect(determineChatPromptIntent({
      prompt: "参考这张图做一个更真实的版本",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
    })).toBe("image_generate");
  });

  it("routes short follow-up modifiers to image edit when recent image context exists", () => {
    expect(determineChatPromptIntent({
      prompt: "胸部大一点",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("image_edit");
  });

  it("keeps question-like follow-ups in normal chat even with recent image context", () => {
    expect(determineChatPromptIntent({
      prompt: "这张图为什么看起来有点假？",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("chat");
  });

  it("lets the explicit image button force image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "一个黑白极简封面",
      explicitIntent: "image_generate",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("image_generate");
  });
});
