import { describe, expect, it, vi } from "vitest";

import {
  normalizeBaiduImageSearchCards,
  searchPublicReferenceImages,
} from "./imageMaterialSearch";

describe("imageMaterialSearch", () => {
  it("normalizes Baidu detail urls into material results", () => {
    expect(normalizeBaiduImageSearchCards("婚礼 玫瑰 花素材", [
      {
        detailUrl: "https://image.baidu.com/search/detail?fromurl=http%253A%252F%252Fexample.com%252Fpost&objurl=https%253A%252F%252Fcdn.example.com%252Frose.jpg",
        title: "红玫瑰结婚花束",
        thumbnailUrl: "https://img.baidu.com/thumb.jpg",
      },
    ])).toEqual([
      {
        id: "婚礼 玫瑰 花素材:https://cdn.example.com/rose.jpg",
        query: "婚礼 玫瑰 花素材",
        title: "红玫瑰结婚花束",
        thumbnailUrl: "https://img.baidu.com/thumb.jpg",
        fullUrl: "https://cdn.example.com/rose.jpg",
        pageUrl: "http://example.com/post",
        sourceLabel: "example.com",
      },
    ]);
  });

  it("deduplicates results across queries", async () => {
    const searchImpl = vi.fn()
      .mockResolvedValueOnce([
        {
          id: "a",
          query: "婚礼 玫瑰 花素材",
          title: "红玫瑰结婚花束",
          thumbnailUrl: "https://img.baidu.com/a.jpg",
          fullUrl: "https://cdn.example.com/rose.jpg",
          pageUrl: "https://example.com/post",
          sourceLabel: "example.com",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "b",
          query: "婚礼 花束 玫瑰",
          title: "重复结果",
          thumbnailUrl: "https://img.baidu.com/b.jpg",
          fullUrl: "https://cdn.example.com/rose.jpg",
          pageUrl: "https://example.com/post-2",
          sourceLabel: "example.com",
        },
      ]);

    await expect(searchPublicReferenceImages({
      queries: ["婚礼 玫瑰 花素材", "婚礼 花束 玫瑰"],
      searchImpl,
    })).resolves.toEqual([
      {
        id: "a",
        query: "婚礼 玫瑰 花素材",
        title: "红玫瑰结婚花束",
        thumbnailUrl: "https://img.baidu.com/a.jpg",
        fullUrl: "https://cdn.example.com/rose.jpg",
        pageUrl: "https://example.com/post",
        sourceLabel: "example.com",
      },
    ]);
  });
});
