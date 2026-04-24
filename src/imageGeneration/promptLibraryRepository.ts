import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  BUILTIN_PROMPTS,
  type PromptLibraryPreview,
} from "./promptLibraryBuiltins";

export type { PromptLibraryPreview } from "./promptLibraryBuiltins";

export type PromptLibraryEntry = {
  id: string;
  origin: "builtin" | "user";
  category: string;
  title: string;
  text: string;
  tags: string[];
  preview: PromptLibraryPreview;
  isFavorite: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type StoredUserPrompt = {
  id: string;
  category: string;
  title: string;
  text: string;
  tags: string[];
  preview: PromptLibraryPreview;
  createdAt: number;
  updatedAt: number;
};

type StoredBuiltinPromptOverride = {
  id: string;
  category: string;
  title: string;
  text: string;
  tags: string[];
  preview: PromptLibraryPreview;
  updatedAt: number;
};

type StoredPromptLibrary = {
  userPrompts?: StoredUserPrompt[];
  favoriteIds?: string[];
  builtinOverrides?: StoredBuiltinPromptOverride[];
  deletedBuiltinIds?: string[];
};

export type PromptLibraryState = {
  entries: PromptLibraryEntry[];
  favoriteIds: string[];
};

export type UpsertPromptLibraryInput = {
  id?: string;
  category: string;
  title: string;
  text: string;
  tags?: string[];
  preview?: PromptLibraryPreview;
};

function defaultPromptPreview(title: string): PromptLibraryPreview {
  const palette = [
    "linear-gradient(135deg,#ffe2cc,#ffc2a8)",
    "linear-gradient(135deg,#efe3ff,#cbb8ff)",
    "linear-gradient(135deg,#dff8ff,#bdeaff)",
    "linear-gradient(135deg,#fff0d8,#ffd48f)",
  ];
  const index = Math.abs(title.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % palette.length;
  return { kind: "gradient", value: palette[index]! };
}

export class PromptLibraryRepository {
  private readonly storageDir: string;
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(storagePath: string) {
    this.storageDir = path.join(storagePath, "prompt-library");
    this.filePath = path.join(this.storageDir, "library.json");
  }

  async loadState(): Promise<PromptLibraryState> {
    const stored = await this.readStore();
    const favoriteIds = this.normalizeFavoriteIds(stored.favoriteIds);
    const favoriteSet = new Set(favoriteIds);
    const deletedBuiltinIds = new Set(this.normalizeDeletedBuiltinIds(stored.deletedBuiltinIds));
    const builtinOverrides = this.normalizeBuiltinOverrides(stored.builtinOverrides);
    const builtinEntries: PromptLibraryEntry[] = BUILTIN_PROMPTS
      .filter(prompt => !deletedBuiltinIds.has(prompt.id))
      .map(prompt => {
        const override = builtinOverrides.get(prompt.id);
        return {
          id: prompt.id,
          origin: "builtin",
          category: override?.category ?? prompt.category,
          title: override?.title ?? prompt.title,
          text: override?.text ?? prompt.text,
          tags: [...(override?.tags ?? prompt.tags)],
          preview: override?.preview ?? prompt.preview,
          isFavorite: favoriteSet.has(prompt.id),
        };
      });
    const userEntries: PromptLibraryEntry[] = this.normalizeUserPrompts(stored.userPrompts).map(prompt => ({
      ...prompt,
      origin: "user",
      isFavorite: favoriteSet.has(prompt.id),
    }));

    return {
      entries: [...userEntries, ...builtinEntries],
      favoriteIds,
    };
  }

  async savePrompt(input: UpsertPromptLibraryInput): Promise<PromptLibraryEntry> {
    const trimmedTitle = input.title.trim();
    const trimmedText = input.text.trim();
    const trimmedCategory = input.category.trim();
    if (!trimmedTitle || !trimmedText || !trimmedCategory) {
      throw new Error("Prompt title, text, and category are required.");
    }

    const normalizedTags = (input.tags ?? [])
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    const normalizedPreview = input.preview ?? defaultPromptPreview(trimmedTitle);

    const stored = await this.readStore();
    const favoriteIds = this.normalizeFavoriteIds(stored.favoriteIds);
    const builtinIds = new Set(BUILTIN_PROMPTS.map(prompt => prompt.id));
    const userPrompts = this.normalizeUserPrompts(stored.userPrompts);
    const builtinOverrides = this.normalizeBuiltinOverrides(stored.builtinOverrides);
    const deletedBuiltinIds = this.normalizeDeletedBuiltinIds(stored.deletedBuiltinIds);
    const now = Date.now();
    const promptId = input.id?.trim() || `up-${randomUUID()}`;
    if (builtinIds.has(promptId)) {
      builtinOverrides.set(promptId, {
        id: promptId,
        category: trimmedCategory,
        title: trimmedTitle,
        text: trimmedText,
        tags: normalizedTags,
        preview: normalizedPreview,
        updatedAt: now,
      });

      await this.writeStore({
        userPrompts,
        favoriteIds,
        builtinOverrides: [...builtinOverrides.values()],
        deletedBuiltinIds: deletedBuiltinIds.filter(id => id !== promptId),
      });

      return {
        id: promptId,
        origin: "builtin",
        category: trimmedCategory,
        title: trimmedTitle,
        text: trimmedText,
        tags: normalizedTags,
        preview: normalizedPreview,
        isFavorite: favoriteIds.includes(promptId),
      };
    }

    const nextPrompt: StoredUserPrompt = {
      id: promptId,
      category: trimmedCategory,
      title: trimmedTitle,
      text: trimmedText,
      tags: normalizedTags,
      preview: normalizedPreview,
      createdAt: userPrompts.find(prompt => prompt.id === promptId)?.createdAt ?? now,
      updatedAt: now,
    };
    const existingIndex = userPrompts.findIndex(prompt => prompt.id === promptId);
    if (existingIndex >= 0) {
      userPrompts[existingIndex] = nextPrompt;
    } else {
      userPrompts.unshift(nextPrompt);
    }
    await this.writeStore({
      userPrompts,
      favoriteIds,
      builtinOverrides: [...builtinOverrides.values()],
      deletedBuiltinIds,
    });

    return {
      ...nextPrompt,
      origin: "user",
      isFavorite: favoriteIds.includes(promptId),
    };
  }

  async deletePrompt(id: string): Promise<void> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      return;
    }

    const stored = await this.readStore();
    const builtinIds = new Set(BUILTIN_PROMPTS.map(prompt => prompt.id));
    const favoriteIds = this.normalizeFavoriteIds(stored.favoriteIds).filter(favoriteId => favoriteId !== trimmedId);
    const builtinOverrides = this.normalizeBuiltinOverrides(stored.builtinOverrides);
    builtinOverrides.delete(trimmedId);

    if (builtinIds.has(trimmedId)) {
      const deletedBuiltinIds = [
        trimmedId,
        ...this.normalizeDeletedBuiltinIds(stored.deletedBuiltinIds).filter(id => id !== trimmedId),
      ];
      await this.writeStore({
        userPrompts: this.normalizeUserPrompts(stored.userPrompts),
        favoriteIds,
        builtinOverrides: [...builtinOverrides.values()],
        deletedBuiltinIds,
      });
      return;
    }

    await this.writeStore({
      userPrompts: this.normalizeUserPrompts(stored.userPrompts).filter(prompt => prompt.id !== trimmedId),
      favoriteIds,
      builtinOverrides: [...builtinOverrides.values()],
      deletedBuiltinIds: this.normalizeDeletedBuiltinIds(stored.deletedBuiltinIds),
    });
  }

  async toggleFavorite(id: string): Promise<PromptLibraryState> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      return this.loadState();
    }

    const stored = await this.readStore();
    const favoriteIds = this.normalizeFavoriteIds(stored.favoriteIds);
    const nextFavoriteIds = favoriteIds.includes(trimmedId)
      ? favoriteIds.filter(favoriteId => favoriteId !== trimmedId)
      : [trimmedId, ...favoriteIds];

    await this.writeStore({
      userPrompts: this.normalizeUserPrompts(stored.userPrompts),
      favoriteIds: nextFavoriteIds,
      builtinOverrides: [...this.normalizeBuiltinOverrides(stored.builtinOverrides).values()],
      deletedBuiltinIds: this.normalizeDeletedBuiltinIds(stored.deletedBuiltinIds),
    });

    return this.loadState();
  }

  private async readStore(): Promise<StoredPromptLibrary> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as StoredPromptLibrary;
    } catch {
      return {};
    }
  }

  private async writeStore(store: StoredPromptLibrary): Promise<void> {
    await this.enqueueWrite(async () => {
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), "utf8");
    });
  }

  private normalizeFavoriteIds(ids: string[] | undefined): string[] {
    return Array.isArray(ids)
      ? [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map(id => id.trim()))]
      : [];
  }

  private normalizeDeletedBuiltinIds(ids: string[] | undefined): string[] {
    const builtinIds = new Set(BUILTIN_PROMPTS.map(prompt => prompt.id));
    return Array.isArray(ids)
      ? [...new Set(
        ids
          .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
          .map(id => id.trim())
          .filter(id => builtinIds.has(id)),
      )]
      : [];
  }

  private normalizeBuiltinOverrides(
    overrides: StoredBuiltinPromptOverride[] | undefined,
  ): Map<string, StoredBuiltinPromptOverride> {
    const builtinIds = new Set(BUILTIN_PROMPTS.map(prompt => prompt.id));
    const normalized = Array.isArray(overrides)
      ? overrides
        .filter(override =>
          override &&
          typeof override.id === "string" &&
          typeof override.category === "string" &&
          typeof override.title === "string" &&
          typeof override.text === "string" &&
          builtinIds.has(override.id.trim()),
        )
        .map<StoredBuiltinPromptOverride>(override => ({
          id: override.id.trim(),
          category: override.category.trim(),
          title: override.title.trim(),
          text: override.text.trim(),
          tags: Array.isArray(override.tags)
            ? override.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map(tag => tag.trim())
            : [],
          preview: override.preview?.kind === "image" && typeof override.preview.src === "string"
            ? { kind: "image" as const, src: override.preview.src }
            : override.preview?.kind === "gradient" && typeof override.preview.value === "string"
              ? { kind: "gradient" as const, value: override.preview.value }
              : defaultPromptPreview(override.title),
          updatedAt: typeof override.updatedAt === "number" ? override.updatedAt : Date.now(),
        }))
        .filter(override => Boolean(override.id && override.category && override.title && override.text))
      : [];

    return new Map(normalized.map(override => [override.id, override]));
  }

  private normalizeUserPrompts(prompts: StoredUserPrompt[] | undefined): StoredUserPrompt[] {
    return Array.isArray(prompts)
      ? prompts
        .filter(prompt =>
          prompt &&
          typeof prompt.id === "string" &&
          typeof prompt.category === "string" &&
          typeof prompt.title === "string" &&
          typeof prompt.text === "string",
        )
        .map<StoredUserPrompt>(prompt => ({
          id: prompt.id.trim(),
          category: prompt.category.trim(),
          title: prompt.title.trim(),
          text: prompt.text.trim(),
          tags: Array.isArray(prompt.tags)
            ? prompt.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map(tag => tag.trim())
            : [],
          preview: prompt.preview?.kind === "image" && typeof prompt.preview.src === "string"
            ? { kind: "image" as const, src: prompt.preview.src }
            : prompt.preview?.kind === "gradient" && typeof prompt.preview.value === "string"
              ? { kind: "gradient" as const, value: prompt.preview.value }
              : defaultPromptPreview(prompt.title),
          createdAt: typeof prompt.createdAt === "number" ? prompt.createdAt : Date.now(),
          updatedAt: typeof prompt.updatedAt === "number" ? prompt.updatedAt : Date.now(),
        }))
        .filter(prompt => Boolean(prompt.id && prompt.category && prompt.title && prompt.text))
        .sort((left, right) => right.updatedAt - left.updatedAt)
      : [];
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = next;
    await next;
  }
}
