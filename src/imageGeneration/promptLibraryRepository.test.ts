import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PromptLibraryRepository } from "./promptLibraryRepository";

const tempDirs: string[] = [];

describe("PromptLibraryRepository", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  it("merges builtin prompts with user prompts and favorites", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "prompt-library-"));
    tempDirs.push(storagePath);

    const repository = new PromptLibraryRepository(storagePath);
    const saved = await repository.savePrompt({
      title: "我的提示词",
      category: "自定义",
      text: "draw a cat",
      tags: ["猫", "测试"],
    });
    await repository.toggleFavorite("bp01");
    await repository.toggleFavorite(saved.id);

    const state = await repository.loadState();

    expect(state.entries.find(entry => entry.id === "bp01")).toMatchObject({
      origin: "builtin",
      isFavorite: true,
    });
    expect(state.entries.find(entry => entry.id === saved.id)).toMatchObject({
      origin: "user",
      title: "我的提示词",
      isFavorite: true,
      tags: ["猫", "测试"],
    });
  });

  it("updates and deletes user prompts", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "prompt-library-"));
    tempDirs.push(storagePath);

    const repository = new PromptLibraryRepository(storagePath);
    const saved = await repository.savePrompt({
      title: "旧标题",
      category: "自定义",
      text: "old text",
    });

    await repository.savePrompt({
      id: saved.id,
      title: "新标题",
      category: "摄影",
      text: "new text",
      tags: ["新"],
      preview: { kind: "image", src: "https://example.com/sample.png" },
    });

    let state = await repository.loadState();
    expect(state.entries.find(entry => entry.id === saved.id)).toMatchObject({
      title: "新标题",
      category: "摄影",
      text: "new text",
      tags: ["新"],
      preview: { kind: "image", src: "https://example.com/sample.png" },
    });

    await repository.deletePrompt(saved.id);
    state = await repository.loadState();
    expect(state.entries.find(entry => entry.id === saved.id)).toBeUndefined();
  });

  it("supports editing and hiding builtin prompts", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "prompt-library-"));
    tempDirs.push(storagePath);

    const repository = new PromptLibraryRepository(storagePath);

    await repository.savePrompt({
      id: "bp01",
      title: "Custom builtin title",
      category: "Custom category",
      text: "custom builtin text",
      tags: ["custom", "builtin"],
      preview: { kind: "image", src: "https://example.com/builtin-sample.png" },
    });
    await repository.toggleFavorite("bp01");

    let state = await repository.loadState();
    expect(state.entries.find(entry => entry.id === "bp01")).toMatchObject({
      origin: "builtin",
      title: "Custom builtin title",
      category: "Custom category",
      text: "custom builtin text",
      tags: ["custom", "builtin"],
      preview: { kind: "image", src: "https://example.com/builtin-sample.png" },
      isFavorite: true,
    });

    await repository.deletePrompt("bp01");

    state = await repository.loadState();
    expect(state.entries.find(entry => entry.id === "bp01")).toBeUndefined();
    expect(state.favoriteIds).not.toContain("bp01");
  });
});
