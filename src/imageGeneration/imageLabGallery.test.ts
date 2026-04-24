import { describe, expect, it } from "vitest";

import {
  buildImageLabResultBatches,
  removeImageLabResult,
  prependImageLabResults,
} from "./imageLabGallery";
import type { ImageLabResultItem } from "./imageLabRuntime";

function createResult(overrides: Partial<ImageLabResultItem>): ImageLabResultItem {
  return {
    id: "result-1",
    batchId: "batch-1",
    src: "https://example.com/1.png",
    prompt: "draw a cat",
    createdAt: 1,
    source: "generate",
    ...overrides,
  };
}

describe("imageLabGallery", () => {
  it("prepends new batches ahead of older results", () => {
    const existing = [
      createResult({ id: "old-1", batchId: "batch-old" }),
    ];
    const incoming = [
      createResult({ id: "new-1", batchId: "batch-new" }),
      createResult({ id: "new-2", batchId: "batch-new" }),
    ];

    expect(prependImageLabResults(existing, incoming).map(result => result.id)).toEqual([
      "new-1",
      "new-2",
      "old-1",
    ]);
  });

  it("groups flat results by batch while preserving batch order", () => {
    const results = [
      createResult({ id: "variant-1", batchId: "batch-variant", source: "variant" }),
      createResult({ id: "variant-2", batchId: "batch-variant", source: "variant" }),
      createResult({ id: "gen-1", batchId: "batch-generate", source: "generate" }),
    ];

    expect(buildImageLabResultBatches(results)).toEqual([
      {
        id: "batch-variant",
        prompt: "draw a cat",
        createdAt: 1,
        source: "variant",
        itemCount: 2,
        items: [
          results[0],
          results[1],
        ],
      },
      {
        id: "batch-generate",
        prompt: "draw a cat",
        createdAt: 1,
        source: "generate",
        itemCount: 1,
        items: [
          results[2],
        ],
      },
    ]);
  });

  it("removes a single image result without affecting the remaining batch", () => {
    const results = [
      createResult({ id: "result-1", batchId: "batch-1" }),
      createResult({ id: "result-2", batchId: "batch-1" }),
      createResult({ id: "result-3", batchId: "batch-2" }),
    ];

    expect(removeImageLabResult(results, "result-2")).toEqual([
      results[0],
      results[2],
    ]);
  });
});
