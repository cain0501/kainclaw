import { afterEach, describe, expect, it, vi } from "vitest";
import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import {
  INTENT_ROUTER_TIMEOUT_MS,
  routeIntentWithLLM,
} from "./llmIntentRouter";

function createProviderReturning(text: string): IProviderAdapter {
  return {
    runStep: vi.fn().mockResolvedValue({
      text,
      toolCalls: [],
      done: true,
    }),
  };
}

describe("llmIntentRouter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes data-visualization requests to image generation", async () => {
    const provider = createProviderReturning('{"intent":"image_generate"}');

    await expect(routeIntentWithLLM({
      prompt: "来一张数据可视化图",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("image_generate");
  });

  it("routes chart-making requests to image generation", async () => {
    const provider = createProviderReturning('{"intent":"image_generate"}');

    await expect(routeIntentWithLLM({
      prompt: "帮我把这组数字变成图表",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("image_generate");
  });

  it("routes edit follow-ups with recent image context to image edit", async () => {
    const provider = createProviderReturning('{"intent":"image_edit"}');

    await expect(routeIntentWithLLM({
      prompt: "这张图太假了，修一下",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("image_edit");
  });

  it("routes explanation requests about an image to chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "解释一下为什么这张图看起来不真实",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("chat");
  });

  it("treats attachment-only prompts as image generation", async () => {
    const provider = createProviderReturning('{"intent":"image_generate"}');

    await expect(routeIntentWithLLM({
      prompt: "",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("image_generate");

    expect(vi.mocked(provider.runStep)).toHaveBeenCalledWith(
      [
        {
          role: "user",
          content: expect.stringContaining("[无文字输入]"),
        },
      ],
      [],
      expect.any(Function),
      undefined,
    );
  });

  it("keeps acknowledgment follow-ups in chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "谢谢",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("chat");
  });

  it("treats long image-heavy rewrite requests as prompt_rewrite", async () => {
    const provider = createProviderReturning('{"intent":"prompt_rewrite"}');

    await expect(routeIntentWithLLM({
      prompt: "平台图标应小尺寸、统一风格、简洁排布。最终输出一张具有强商业感海报。帮我重写一版。",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("prompt_rewrite");
  });

  it("treats attachment-backed prompt-writing requests as prompt_rewrite", async () => {
    const provider = createProviderReturning('{"intent":"prompt_rewrite"}');

    await expect(routeIntentWithLLM({
      prompt: "我上传了一张参考图，先帮我写一版适合这个风格的海报提示词",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("prompt_rewrite");
  });

  it("keeps explicit execution requests with attachments in image generation", async () => {
    const provider = createProviderReturning('{"intent":"image_generate"}');

    await expect(routeIntentWithLLM({
      prompt: "按这版直接生成一张图",
      hasAttachments: true,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("image_generate");
  });

  it("treats brief-optimization requests as prompt_rewrite", async () => {
    const provider = createProviderReturning('{"intent":"prompt_rewrite"}');

    await expect(routeIntentWithLLM({
      prompt: "品牌色是深棕，主视觉要有高级感，帮我优化一下这段设计 brief",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("prompt_rewrite");
  });

  it("treats plain prompt-polish requests as prompt_rewrite", async () => {
    const provider = createProviderReturning('{"intent":"prompt_rewrite"}');

    await expect(routeIntentWithLLM({
      prompt: "这个提示词不满意，帮我优化一下",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("prompt_rewrite");
  });

  it("keeps html prototype requests in chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "请只输出一个完整的 HTML 单文件页面原型，不要解释，不要加 markdown 代码块。第一行必须是 <!DOCTYPE html>",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });

  it("keeps natural-language html prototype requests in chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "做一个摄影师个人作品集首页原型，暗色背景，大图瀑布流，顶部极简导航，名字叫 Lens / 光影档案。",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });

  it("keeps svg artifact requests in chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "请直接输出一个完整 SVG 饼图，显示 Q1-Q4 销售占比，不要解释",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });

  it("keeps mermaid artifact requests in chat", async () => {
    const provider = createProviderReturning('{"intent":"chat"}');

    await expect(routeIntentWithLLM({
      prompt: "请直接输出 mermaid 流程图代码块，描述用户注册到激活的完整流程",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });

  it("falls back to regex routing when the provider times out", async () => {
    vi.useFakeTimers();
    const provider: IProviderAdapter = {
      runStep: vi.fn(
        () => new Promise<never>(() => {}),
      ),
    };

    const intentPromise = routeIntentWithLLM({
      prompt: "生成一张海报",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    });

    await vi.advanceTimersByTimeAsync(INTENT_ROUTER_TIMEOUT_MS);

    await expect(intentPromise).resolves.toBe("image_generate");
  });

  it("falls back to regex routing when the provider throws", async () => {
    const provider: IProviderAdapter = {
      runStep: vi.fn().mockRejectedValue(new Error("provider failed")),
    };

    await expect(routeIntentWithLLM({
      prompt: "胸部大一点",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("image_edit");
  });

  it("falls back to regex routing when the model returns invalid JSON", async () => {
    const provider = createProviderReturning("not json");

    await expect(routeIntentWithLLM({
      prompt: "谢谢",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("chat");
  });

  it("falls back to regex routing for prompt rewrites when the provider returns invalid JSON", async () => {
    const provider = createProviderReturning("not json");

    await expect(routeIntentWithLLM({
      prompt: "根据以上提示词，把你说的归茶这一理念重写一份",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("prompt_rewrite");
  });

  it("falls back to regex routing for html prototype prompts as chat", async () => {
    const provider = createProviderReturning("not json");

    await expect(routeIntentWithLLM({
      prompt: "请只输出一个完整的 HTML 单文件页面原型，不要解释，第一行必须是 <!DOCTYPE html>",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });

  it("falls back to regex routing for natural-language artifact prompts as chat", async () => {
    const provider = createProviderReturning("not json");

    await expect(routeIntentWithLLM({
      prompt: "做一个摄影师个人作品集首页原型，暗色背景，大图瀑布流，顶部极简导航，名字叫 Lens / 光影档案。",
      hasAttachments: false,
      hasRecentGeneratedImageContext: false,
      provider,
    })).resolves.toBe("chat");
  });
  it("routes recent-image prototype conversion requests to derive_artifact", async () => {
    const provider = createProviderReturning('{"intent":"derive_artifact"}');

    await expect(routeIntentWithLLM({
      prompt: "Turn this design into a clickable HTML prototype",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("derive_artifact");
  });

  it("falls back to regex routing for derive_artifact requests", async () => {
    const provider = createProviderReturning("not json");

    await expect(routeIntentWithLLM({
      prompt: "Turn this design into a clickable HTML prototype",
      hasAttachments: false,
      hasRecentGeneratedImageContext: true,
      provider,
    })).resolves.toBe("derive_artifact");
  });
});
