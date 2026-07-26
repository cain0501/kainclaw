import { describe, expect, it } from "vitest";
import {
  buildImageAspectRatioInstruction,
  getCenterCropRect,
  normalizeImageAspectRatio,
} from "./imageAspectRatio";

describe("imageAspectRatio", () => {
  it("normalizes valid ratios and rejects invalid values", () => {
    expect(normalizeImageAspectRatio(" 16:9 ")).toBe("16:9");
    expect(normalizeImageAspectRatio("4:3")).toBe("4:3");
    expect(normalizeImageAspectRatio("1792x1024")).toBeUndefined();
    expect(normalizeImageAspectRatio("0:9")).toBeUndefined();
  });

  it("calculates a centered vertical crop for a wide target", () => {
    expect(getCenterCropRect(1264, 848, "16:9")).toEqual({
      x: 0,
      y: 68,
      width: 1264,
      height: 711,
    });
  });

  it("calculates a centered horizontal crop for a tall target", () => {
    expect(getCenterCropRect(1024, 1536, "16:9")).toEqual({
      x: 0,
      y: 480,
      width: 1024,
      height: 576,
    });
  });

  it("does not crop an image that already matches", () => {
    expect(getCenterCropRect(1920, 1080, "16:9")).toBeUndefined();
  });

  it("adds a full-canvas instruction only when a ratio is selected", () => {
    expect(buildImageAspectRatioInstruction("make a poster", "16:9")).toContain("exactly 16:9");
    expect(buildImageAspectRatioInstruction("make a poster", undefined)).toBe("make a poster");
  });
});
