import { describe, expect, it, vi } from "vitest";

import {
  MidtaiLibraryHost,
  filterMidtaiLibraryItems,
  mapDesignProjectToMidtaiItem,
  mapImageResultToMidtaiItem,
  type MidtaiLibraryItem,
} from "./midtaiLibraryHost";

describe("midtaiLibraryHost", () => {
  it("maps image results into unified DTOs", () => {
    expect(
      mapImageResultToMidtaiItem({
        id: "img-1",
        batchId: "batch-1",
        src: "https://example.com/image.png",
        prompt: "Landing hero",
        createdAt: 100,
        source: "generate",
      }),
    ).toEqual({
      id: "img-1",
      name: "Landing hero",
      contentType: "image",
      source: "chat",
      thumbnail: "https://example.com/image.png",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("prefers stored image thumbnails and does not use full data URLs as list thumbnails", () => {
    expect(
      mapImageResultToMidtaiItem({
        id: "img-thumb",
        batchId: "batch-1",
        src: "data:image/png;base64,full-image",
        thumbnail: "data:image/png;base64,small-thumb",
        prompt: "With thumbnail",
        createdAt: 100,
        source: "generate",
      }).thumbnail,
    ).toBe("data:image/png;base64,small-thumb");

    expect(
      mapImageResultToMidtaiItem({
        id: "img-full",
        batchId: "batch-1",
        src: "data:image/png;base64,full-image",
        prompt: "Full image only",
        createdAt: 100,
        source: "generate",
      }).thumbnail,
    ).toBeUndefined();
  });

  it("maps summary-only image results into Midtai DTOs without requiring src", () => {
    expect(
      mapImageResultToMidtaiItem({
        id: "img-summary",
        batchId: "batch-1",
        prompt: "Summary only",
        createdAt: 100,
        source: "generate",
        thumbnail: "data:image/png;base64,small-thumb",
      }),
    ).toEqual({
      id: "img-summary",
      name: "Summary only",
      contentType: "image",
      source: "chat",
      thumbnail: "data:image/png;base64,small-thumb",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("maps design projects into unified DTOs", () => {
    expect(
      mapDesignProjectToMidtaiItem(
        {
          projectId: "design-1",
          name: "Marketing Page",
          source: "artifact",
          activeVersionId: "version-2",
          createdAt: 10,
          updatedAt: 20,
          lastOpenedAt: 30,
          versionCount: 2,
        },
        "data:image/png;base64,abc",
      ),
    ).toEqual({
      id: "design-1",
      name: "Marketing Page",
      contentType: "design",
      source: "chat",
      thumbnail: "data:image/png;base64,abc",
      createdAt: 10,
      updatedAt: 20,
      projectId: "design-1",
      version: "v2",
    });
  });

  it("filters unified DTOs by content type and source", () => {
    const items: MidtaiLibraryItem[] = [
      {
        id: "img-chat",
        name: "Img chat",
        contentType: "image",
        source: "chat",
        createdAt: 1,
        updatedAt: 4,
      },
      {
        id: "img-midtai",
        name: "Img midtai",
        contentType: "image",
        source: "midtai",
        createdAt: 1,
        updatedAt: 3,
      },
      {
        id: "design-blank",
        name: "Design blank",
        contentType: "design",
        source: "blank",
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    expect(filterMidtaiLibraryItems(items, "image").map(item => item.id)).toEqual([
      "img-chat",
      "img-midtai",
    ]);
    expect(filterMidtaiLibraryItems(items, "design").map(item => item.id)).toEqual([
      "design-blank",
    ]);
    expect(filterMidtaiLibraryItems(items, "chat").map(item => item.id)).toEqual([
      "img-chat",
    ]);
    expect(filterMidtaiLibraryItems(items, "midtai").map(item => item.id)).toEqual([
      "img-midtai",
    ]);
  });

  it("aggregates image and design stores into one sorted list", async () => {
    const previewLoader = vi.fn(async () => new Map([["design-1", "data:image/png;base64,preview"]]));
    const host = new MidtaiLibraryHost(
      async () => [
        {
          id: "img-1",
          batchId: "batch-1",
          src: "https://example.com/1.png",
          prompt: "Older image",
          createdAt: 100,
          source: "generate",
        },
        {
          id: "img-2",
          batchId: "batch-2",
          src: "https://example.com/2.png",
          prompt: "Newest image",
          createdAt: 400,
          source: "edit",
        },
      ],
      async () => [
        {
          projectId: "design-1",
          name: "Design One",
          source: "blank",
          activeVersionId: "version-1",
          createdAt: 50,
          updatedAt: 300,
          lastOpenedAt: 300,
          versionCount: 1,
        },
      ],
      previewLoader,
    );

    const items = await host.getLibraryItems();

    expect(items.map(item => item.id)).toEqual(["img-2", "design-1", "img-1"]);
    expect(items[0]?.source).toBe("midtai");
    expect(items[1]?.thumbnail).toBe("data:image/png;base64,preview");
    expect(previewLoader).toHaveBeenCalledTimes(1);
    expect(previewLoader).toHaveBeenCalledWith([
      expect.objectContaining({ projectId: "design-1" }),
    ]);
  });

  it("returns paged image library DTOs without loading design projects", async () => {
    const imagePageLoader = vi.fn(async () => ({
      items: [
        {
          id: "img-2",
          batchId: "batch-2",
          prompt: "Newest image",
          createdAt: 400,
          source: "edit" as const,
          thumbnail: "data:image/png;base64,thumb",
        },
      ],
      offset: 12,
      limit: 12,
      total: 20,
      hasMore: true,
      nextOffset: 13,
    }));
    const designLoader = vi.fn(async () => []);
    const host = new MidtaiLibraryHost(
      async () => [],
      designLoader,
      undefined,
      imagePageLoader,
    );

    await expect(host.getImageLibraryPage({ offset: 12, limit: 12 })).resolves.toEqual({
      items: [
        {
          id: "img-2",
          name: "Newest image",
          contentType: "image",
          source: "midtai",
          thumbnail: "data:image/png;base64,thumb",
          createdAt: 400,
          updatedAt: 400,
        },
      ],
      offset: 12,
      limit: 12,
      total: 20,
      hasMore: true,
      nextOffset: 13,
    });
    expect(imagePageLoader).toHaveBeenCalledWith({ offset: 12, limit: 12 });
    expect(designLoader).not.toHaveBeenCalled();
  });
});
