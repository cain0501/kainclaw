import { describe, expect, it } from "vitest";
import { resolveRequestedImageSize } from "./imagePromptSizing";

describe("imagePromptSizing", () => {
  it("extracts explicit dimensions from the prompt", () => {
    expect(resolveRequestedImageSize("??? 1920x1080 ?????")).toEqual({
      size: "1920x1080",
      source: "dimensions",
    });
  });

  it("keeps 2048x2048 explicit dimensions intact", () => {
    expect(resolveRequestedImageSize("???? 2048x2048 ?????")).toEqual({
      size: "2048x2048",
      source: "dimensions",
    });
  });

  it("derives a flexible size from a requested ratio", () => {
    expect(resolveRequestedImageSize("???? 16:9 ?????")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
    expect(resolveRequestedImageSize("??? 9:16 ????")).toEqual({
      size: "1024x1536",
      source: "ratio",
    });
  });

  it("returns null when the prompt does not mention size or ratio", () => {
    expect(resolveRequestedImageSize("????????")).toBeNull();
  });

  it("maps unsupported wide ratios to the nearest supported backend landscape size", () => {
    expect(resolveRequestedImageSize("??? 2:1 ??????")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
    expect(resolveRequestedImageSize("??? 4:3 ?????")).toEqual({
      size: "1536x1024",
      source: "ratio",
    });
  });
});
