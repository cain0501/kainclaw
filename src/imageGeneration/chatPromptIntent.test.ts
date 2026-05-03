import { describe, expect, it } from "vitest";
import { determineChatPromptIntent } from "./chatPromptIntent";

describe("chatPromptIntent", () => {
  it("routes strong generation requests to image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "Generate a minimalist black and white poster",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("image_generate");
  });

  it("treats attachment-backed prompts as image generation by default", () => {
    expect(determineChatPromptIntent({
      prompt: "Use this reference image to make a more realistic version",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
    })).toBe("image_generate");
  });

  it("routes short follow-up modifiers to image edit when recent image context exists", () => {
    expect(determineChatPromptIntent({
      prompt: "Make the lighting softer",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("image_edit");
  });

  it("keeps question-like follow-ups in normal chat even with recent image context", () => {
    expect(determineChatPromptIntent({
      prompt: "Why does this image still look fake?",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("chat");
  });

  it("lets the explicit image button force image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "A monochrome magazine cover",
      explicitIntent: "image_generate",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("image_generate");
  });

  it("routes prompt rewrite requests away from image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "This prompt is not good enough, help me improve it",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("prompt_rewrite");
  });

  it("treats attachment-backed prompt writing as prompt rewrite", () => {
    expect(determineChatPromptIntent({
      prompt: "I uploaded a reference image, first help me write a better poster prompt for this style",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
    })).toBe("prompt_rewrite");
  });

  it("routes recent-image prototype conversion requests to derive_artifact", () => {
    expect(determineChatPromptIntent({
      prompt: "Turn this design into a clickable HTML prototype",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("derive_artifact");
  });

  it("keeps explicit html authoring requests in chat even when image context exists", () => {
    expect(determineChatPromptIntent({
      prompt: "请只输出一个完整的 HTML 单文件页面原型，不要解释，第一行必须是 <!DOCTYPE html>",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
    })).toBe("chat");
  });

  it("keeps direct generation commands with attachments in image generation", () => {
    expect(determineChatPromptIntent({
      prompt: "Generate the image directly from this prompt",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
    })).toBe("image_generate");
  });

  it("keeps html prototype requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "Return one complete single-file HTML landing page prototype. The first line must be <!DOCTYPE html>.",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("keeps natural-language html prototype requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "Create a photography portfolio homepage prototype with a dark background and a masonry gallery",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("keeps official-site hero requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "做一个高端 AI 产品官网首屏，黑白主色，带少量红色点缀，偏信息建筑风格",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("keeps product intro dual-column requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "做一个双栏产品介绍页，左侧大标题，右侧特性卡片，极简编辑感",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("keeps svg artifact requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "Please output a complete SVG pie chart that shows Q1-Q4 sales share with no explanation",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("keeps mermaid artifact requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: "Please output a Mermaid flowchart for the full user signup and activation flow",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

  it("does not misclassify html analysis prompts as artifact generation", () => {
    expect(determineChatPromptIntent({
      prompt: "Help me analyze the layout of this homepage prototype",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });
  it("keeps Tweaks-bridge html authoring requests on the normal chat pipeline", () => {
    expect(determineChatPromptIntent({
      prompt: [
        "Please generate a single-file HTML page and embed a KainClaw Tweaks bridge.",
        "On load, call window.parent.postMessage({ type: '__edit_mode_available' }, '*').",
        "Listen for __activate_edit_mode and __deactivate_edit_mode.",
        "Keep the result as a complete previewable landing page.",
      ].join(" "),
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
    })).toBe("chat");
  });

});
