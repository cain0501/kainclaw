import { describe, expect, it, vi } from "vitest";

import type {
  ImageConfig,
  ImageModelMeta,
  ImagePromptHistoryEntry,
  ProviderMeta,
} from "./storage/settingsRepository";
import {
  completeOnboardingProvider,
  deleteSettingsProvider,
  loadSettingsPanelData,
  saveSettingsProvider,
  validateOnboardingProviderKey,
} from "./settingsHost";

class FakeSettingsStore {
  providers: ProviderMeta[] = [];
  activeProviderId: string | undefined;
  apiKeys = new Map<string, string>();
  imageModels: ImageModelMeta[] = [];
  activeImageModelId: string | undefined;
  imageModelApiKeys = new Map<string, string>();
  imageConfig: ImageConfig | undefined;
  imageApiKey: string | undefined;
  imagePromptHistory: ImagePromptHistoryEntry[] = [];
  onboardingDone = false;
  licenseActivated = false;
  showThinkingSummaries = true;

  getProviders(): ProviderMeta[] {
    return [...this.providers];
  }

  async saveProviders(providers: ProviderMeta[]): Promise<void> {
    this.providers = [...providers];
  }

  getActiveProviderId(): string | undefined {
    return this.activeProviderId;
  }

  async setActiveProviderId(id: string): Promise<void> {
    this.activeProviderId = id || undefined;
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.apiKeys.get(providerId);
  }

  async storeApiKey(providerId: string, apiKey: string): Promise<void> {
    this.apiKeys.set(providerId, apiKey);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    this.apiKeys.delete(providerId);
  }

  getImageConfig(): ImageConfig | undefined {
    return this.imageConfig;
  }

  async saveImageConfig(config: ImageConfig): Promise<void> {
    this.imageConfig = config;
  }

  getImageModels(): ImageModelMeta[] {
    return [...this.imageModels];
  }

  async saveImageModels(models: ImageModelMeta[]): Promise<void> {
    this.imageModels = [...models];
  }

  getActiveImageModelId(): string | undefined {
    return this.activeImageModelId;
  }

  async setActiveImageModelId(id: string): Promise<void> {
    this.activeImageModelId = id || undefined;
  }

  async getImageApiKey(): Promise<string | undefined> {
    return this.imageApiKey;
  }

  async storeImageApiKey(apiKey: string): Promise<void> {
    this.imageApiKey = apiKey;
  }

  async deleteImageApiKey(): Promise<void> {
    this.imageApiKey = undefined;
  }

  async getImageModelApiKey(imageModelId: string): Promise<string | undefined> {
    return this.imageModelApiKeys.get(imageModelId);
  }

  async storeImageModelApiKey(imageModelId: string, apiKey: string): Promise<void> {
    this.imageModelApiKeys.set(imageModelId, apiKey);
  }

  async deleteImageModelApiKey(imageModelId: string): Promise<void> {
    this.imageModelApiKeys.delete(imageModelId);
  }

  async deleteImageModel(imageModelId: string): Promise<void> {
    this.imageModels = this.imageModels.filter(model => model.id !== imageModelId);
    this.imageModelApiKeys.delete(imageModelId);
    if (this.activeImageModelId === imageModelId) {
      this.activeImageModelId = this.imageModels[0]?.id;
    }
  }

  getImagePromptHistory(): ImagePromptHistoryEntry[] {
    return [...this.imagePromptHistory];
  }

  async saveImagePromptHistory(entries: ImagePromptHistoryEntry[]): Promise<void> {
    this.imagePromptHistory = [...entries];
  }

  isLicenseActivated(): boolean {
    return this.licenseActivated;
  }

  async setOnboardingDone(done: boolean): Promise<void> {
    this.onboardingDone = done;
  }

  getShowThinkingSummaries(): boolean {
    return this.showThinkingSummaries;
  }
}

describe("settingsHost", () => {
  it("wraps provider-key validation into UI-friendly results", async () => {
    const ok = await validateOnboardingProviderKey({
      providerType: "claude-cli",
      apiKey: "",
    });
    expect(ok).toEqual({ ok: true });

    const invalid = await validateOnboardingProviderKey({
      providerType: "openai-compatible",
      apiKey: "secret",
      baseUrl: "",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toContain("Base URL");
    }
  });

  it("completes onboarding and activates the created provider id", async () => {
    const settings = new FakeSettingsStore();

    const result = await completeOnboardingProvider({
      settings,
      meta: {
        id: "",
        alias: "Claude",
        type: "anthropic",
        model: "claude-sonnet",
      },
      apiKey: "secret",
      createId: () => "provider-1",
    });

    expect(result).toEqual({ providerId: "provider-1" });
    expect(settings.providers).toEqual([
      {
        id: "provider-1",
        alias: "Claude",
        type: "anthropic",
        model: "claude-sonnet",
      },
    ]);
    expect(settings.apiKeys.get("provider-1")).toBe("secret");
    expect(settings.activeProviderId).toBe("provider-1");
    expect(settings.onboardingDone).toBe(true);
  });

  it("loads settings panel data with hasKey flags only", async () => {
    const settings = new FakeSettingsStore();
    settings.providers = [
      { id: "provider-1", alias: "Claude", type: "anthropic", model: "claude-sonnet" },
      { id: "provider-2", alias: "GPT", type: "openai", model: "gpt-4o" },
    ];
    settings.activeProviderId = "provider-2";
    settings.licenseActivated = true;
    settings.showThinkingSummaries = false;
    settings.apiKeys.set("provider-2", "secret");
    settings.imageModels = [{
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-1",
      authMode: "raw",
      responseFormat: "url",
    }];
    settings.activeImageModelId = "image-model-1";
    settings.imageConfig = {
      id: "image-model-1",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-1",
      authMode: "raw",
      responseFormat: "url",
    };
    settings.imageApiKey = "image-secret";
    settings.imageModelApiKeys.set("image-model-1", "image-secret");
    settings.imagePromptHistory = [
      {
        prompt: "Generate a release note cover",
        createdAt: 1_713_000_000_000,
      },
    ];

    const result = await loadSettingsPanelData(settings);

    expect(result).toEqual({
      providers: [
        {
          id: "provider-1",
          alias: "Claude",
          type: "anthropic",
          model: "claude-sonnet",
          hasKey: false,
        },
        {
          id: "provider-2",
          alias: "GPT",
          type: "openai",
          model: "gpt-4o",
          hasKey: true,
        },
      ],
      activeId: "provider-2",
      licenseActivated: true,
      showThinkingSummaries: false,
      imageConfig: {
        id: "image-model-1",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-1",
        authMode: "raw",
        responseFormat: "url",
      },
      imageModels: [
        {
          id: "image-model-1",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-1",
          authMode: "raw",
          responseFormat: "url",
          hasKey: true,
        },
      ],
      activeImageModelId: "image-model-1",
      imageHasKey: true,
      imagePromptHistory: [
        {
          prompt: "Generate a release note cover",
          createdAt: 1_713_000_000_000,
        },
      ],
    });
  });

  it("saves providers with a normalized id and persists api keys under that same id", async () => {
    const settings = new FakeSettingsStore();

    const result = await saveSettingsProvider({
      settings,
      meta: {
        id: "",
        alias: "Claude",
        type: "anthropic",
        model: "claude-sonnet",
      },
      apiKey: "secret",
      createId: () => "provider-1",
    });

    expect(result).toEqual({ providerId: "provider-1" });
    expect(settings.providers).toEqual([
      {
        id: "provider-1",
        alias: "Claude",
        type: "anthropic",
        model: "claude-sonnet",
      },
    ]);
    expect(settings.apiKeys.get("provider-1")).toBe("secret");
  });

  it("deletes a provider and reassigns active provider when needed", async () => {
    const settings = new FakeSettingsStore();
    settings.providers = [
      { id: "provider-1", alias: "Claude", type: "anthropic", model: "claude-sonnet" },
      { id: "provider-2", alias: "GPT", type: "openai", model: "gpt-4o" },
    ];
    settings.activeProviderId = "provider-1";
    settings.apiKeys.set("provider-1", "secret");

    const result = await deleteSettingsProvider({
      settings,
      id: "provider-1",
    });

    expect(result).toEqual({ nextActiveProviderId: "provider-2" });
    expect(settings.providers).toEqual([
      { id: "provider-2", alias: "GPT", type: "openai", model: "gpt-4o" },
    ]);
    expect(settings.activeProviderId).toBe("provider-2");
    expect(settings.apiKeys.has("provider-1")).toBe(false);
  });
});
