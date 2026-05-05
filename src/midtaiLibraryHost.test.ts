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
    const previewLoader = vi.fn(async () => "preview-html");
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
    expect(items[1]?.thumbnail).toBeUndefined();
    expect(previewLoader).toHaveBeenCalledTimes(1);
  });
});
