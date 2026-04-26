import { describe, expect, it } from "vitest";
import type { IHostAdapter } from "../platform/IHostAdapter";
import {
  SettingsRepository,
  type ImageModelMeta,
  type ProviderMeta,
} from "./settingsRepository";

class FakeHostAdapter implements IHostAdapter {
  private readonly state = new Map<string, unknown>();
  private readonly secrets = new Map<string, string>();

  getWorkspaceRoot(): string | undefined {
    return undefined;
  }

  getEditorSelection(): { selectedText: string; language: string } | null {
    return null;
  }

  async showDiff(): Promise<void> {}

  async requestFileApproval(): Promise<boolean> {
    return true;
  }

  async requestToolApproval(): Promise<boolean> {
    return true;
  }

  showError(): void {}

  async openExternal(): Promise<boolean> {
    return true;
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async storeSecret(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  async setState<T>(key: string, value: T): Promise<void> {
    this.state.set(key, value);
  }

  getStorageUri(): string {
    return "E:\\claudecodejingiang\\vscode-extension\\.tmp";
  }
}

async function seedProviders(
  repository: SettingsRepository,
  providers: ProviderMeta[],
  activeId?: string,
): Promise<void> {
  await repository.saveProviders(providers);
  if (activeId) {
    await repository.setActiveProviderId(activeId);
  }
}

describe("SettingsRepository", () => {
  it("requires baseUrl for openai-compatible providers", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);
    await seedProviders(repository, [
      {
        id: "compat-1",
        alias: "compat",
        type: "openai-compatible",
        model: "deepseek-chat",
      },
    ]);
    await host.storeSecret("cain.apiKey.compat-1", "secret");

    await expect(repository.getProviderConfig("compat-1")).rejects.toThrow(
      "缺少 baseUrl，请在设置面板填写 API 端点地址。",
    );
  });

  it("returns a full openai-compatible provider config when baseUrl is present", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);
    await seedProviders(repository, [
      {
        id: "compat-2",
        alias: "compat",
        type: "openai-compatible",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
      },
    ]);
    await host.storeSecret("cain.apiKey.compat-2", "secret");

    const config = await repository.getProviderConfig("compat-2");

    expect(config).toMatchObject({
      type: "openai-compatible",
      apiKey: "secret",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
    });
  });

  it("falls back to an active Claude-like provider when alias is anthropic", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);
    await seedProviders(
      repository,
      [
        {
          id: "openai-1",
          alias: "gpt",
          type: "openai",
          model: "gpt-4o-mini",
        },
        {
          id: "anthropic-1",
          alias: "Claude Sonnet",
          type: "anthropic",
          model: "claude-sonnet-4-5",
        },
      ],
      "anthropic-1",
    );
    await host.storeSecret("cain.apiKey.anthropic-1", "anthropic-secret");

    const config = await repository.getProviderConfigByAlias("anthropic");

    expect(config).toMatchObject({
      type: "anthropic",
      apiKey: "anthropic-secret",
      model: "claude-sonnet-4-5",
    });
  });

  it("persists thinking summary visibility as opt-out", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);

    expect(repository.getShowThinkingSummaries()).toBe(true);

    await repository.setShowThinkingSummaries(false);
    expect(repository.getShowThinkingSummaries()).toBe(false);

    await repository.setShowThinkingSummaries(true);
    expect(repository.getShowThinkingSummaries()).toBe(true);
  });

  it("stores image models, active image model, api keys, and prompt history separately", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);

    const imageModels: ImageModelMeta[] = [{
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      responseFormat: "url",
    }];
    await repository.saveImageModels(imageModels);
    await repository.setActiveImageModelId("image-model-1");
    await repository.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      responseFormat: "url",
    });
    await repository.storeImageModelApiKey("image-model-1", "image-secret");
    await repository.pushImagePromptHistory("draw a cat");
    await repository.pushImagePromptHistory("draw a dog");
    await repository.pushImagePromptHistory("draw a cat");

    expect(repository.getImageModels()).toEqual(imageModels);
    expect(repository.getActiveImageModelId()).toBe("image-model-1");
    expect(repository.getImageConfig()).toEqual({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      responseFormat: "url",
    });
    await expect(repository.getImageApiKey()).resolves.toBe("image-secret");
    await expect(repository.getImageModelApiKey("image-model-1")).resolves.toBe("image-secret");
    expect(repository.getImagePromptHistory().map(entry => entry.prompt)).toEqual([
      "draw a cat",
      "draw a dog",
    ]);
  });

  it("preserves image model metadata and generation defaults across partial image config saves", async () => {
    const host = new FakeHostAdapter();
    const repository = new SettingsRepository(host);

    await repository.saveImageConfig({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1024x1024",
      batchCount: 1,
      responseFormat: "url",
    });

    await repository.saveImageConfig({
      id: "image-model-1",
      size: "1536x1024",
      batchCount: 2,
    });

    expect(repository.getImageModels()).toEqual([{
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      responseFormat: "url",
    }]);
    expect(repository.getImageConfig()).toEqual({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2",
      authMode: "raw",
      size: "1536x1024",
      batchCount: 2,
      responseFormat: "url",
    });

    await repository.saveImageConfig({
      id: "image-model-1",
      model: "gpt-image-2.1",
      responseFormat: "b64_json",
    });

    expect(repository.getImageModels()).toEqual([{
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2.1",
      authMode: "raw",
      responseFormat: "b64_json",
    }]);
    expect(repository.getImageConfig()).toEqual({
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-2.1",
      authMode: "raw",
      size: "1536x1024",
      batchCount: 2,
      responseFormat: "b64_json",
    });
  });
});
