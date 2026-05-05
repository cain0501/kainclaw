import { describe, expect, it } from "vitest";
import { resolveRequestedImageSize } from "./imagePromptSizing";

describe("imagePromptSizing", () => {
  it("extracts explicit dimensions from the prompt", () => {
    expect(resolveRequestedImageSize("做一张 1920x1080 的产品主图")).toEqual({
      size: "1920x1080",
      source: "dimensions",
    });
  });

  it("derives a flexible size from a requested ratio", () => {
    expect(resolveRequestedImageSize("生成一个 16:9 的法斗头像")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
    expect(resolveRequestedImageSize("来一张 9:16 竖版海报")).toEqual({
      size: "1024x1536",
      source: "ratio",
    });
  });

  it("returns null when the prompt does not mention size or ratio", () => {
    expect(resolveRequestedImageSize("生成一个法斗头像")).toBeNull();
  });
  it("maps unsupported wide ratios to the nearest supported backend landscape size", () => {
    expect(resolveRequestedImageSize("做一张 2:1 的横版主视觉")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
    expect(resolveRequestedImageSize("做一张 4:3 的横版头图")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
  });
});
