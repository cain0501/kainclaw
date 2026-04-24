import { describe, expect, it } from "vitest";

import { resolveImageBatchPlan } from "./imagePromptBatching";

describe("resolveImageBatchPlan", () => {
  it("extracts batch count from a Chinese batch request and strips it from the execution prompt", () => {
    expect(resolveImageBatchPlan({
      prompt: "批量生成三张图片，美少女遛狗，写真感，街头光影",
      defaultBatchCount: 1,
    })).toEqual({
      batchCount: 3,
      promptDerivedBatchCount: 3,
      collageRequested: false,
      executionPrompt: "美少女遛狗，写真感，街头光影\n\n每个输出结果都必须是一张独立完整的单图。不要把多张画面拼在同一张图里，不要做拼图、分屏、联图、九宫格、contact sheet 或 collage。",
    });
  });

  it("keeps collage requests as a single image task", () => {
    expect(resolveImageBatchPlan({
      prompt: "把三张照片拼成一张海报，电影拼贴感",
      defaultBatchCount: 1,
    })).toEqual({
      batchCount: 1,
      promptDerivedBatchCount: null,
      collageRequested: true,
      executionPrompt: "把三张照片拼成一张海报，电影拼贴感",
    });
  });

  it("lets explicit overrides win while still guarding against multi-panel outputs", () => {
    expect(resolveImageBatchPlan({
      prompt: "白底产品图",
      defaultBatchCount: 1,
      overrideBatchCount: 4,
    })).toEqual({
      batchCount: 4,
      promptDerivedBatchCount: null,
      collageRequested: false,
      executionPrompt: "白底产品图\n\n每个输出结果都必须是一张独立完整的单图。不要把多张画面拼在同一张图里，不要做拼图、分屏、联图、九宫格、contact sheet 或 collage。",
    });
  });
});
