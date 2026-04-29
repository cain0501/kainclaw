import type { IHostAdapter } from "../platform/IHostAdapter";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import type { ImageAuthMode } from "../imageGeneration/openAIImageClient";
import type { EffortLevel } from "../thinkingEffort/types";
import { normalizeAppLanguage, type AppLanguage } from "../electronUiLanguage";

/**
 * Settings storage contract (Spec §6.2.1 + §6.2.2):
 *   - API keys -> context.secrets via IHostAdapter get/store methods
 *   - small fields (activeSessionId, onboardingDone, licenseActivated, provider metadata) -> globalState
 *   - never persist API keys into globalState or JSON files
 */

const KEYS = {
  PROVIDERS: "cain.providers",
  ACTIVE_PROVIDER_ID: "cain.activeProviderId",
  IMAGE_MODELS: "cain.imageModels",
  ACTIVE_IMAGE_MODEL_ID: "cain.activeImageModelId",
  IMAGE_CONFIG: "cain.imageConfig",
  IMAGE_PROMPT_HISTORY: "cain.imagePromptHistory",
  ONBOARDING_DONE: "cain.onboardingDone",
  LICENSE_ACTIVATED: "cain.licenseActivated",
  ACTIVE_SESSION_ID: "cain.activeSessionId",
  EFFORT_LEVEL: "cain.effortLevel",
  FAST_MODE: "cain.fastMode",
  SHOW_THINKING_SUMMARIES: "cain.showThinkingSummaries",
  WORKSPACE_ROOT: "cain.workspaceRoot",
  UI_LANGUAGE: "kainclaw.uiLanguage",
} as const;

function normalizeProviderAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function metaLooksClaudeLike(meta: ProviderMeta): boolean {
  const alias = normalizeProviderAlias(meta.alias);
  const model = (meta.model ?? "").trim().toLowerCase();
  return (
    meta.type === "anthropic" ||
    alias.includes("claude") ||
    alias.includes("anthropic") ||
    model.includes("claude") ||
    model.includes("anthropic/")
  );
}

/** Provider metadata stored in globalState, without apiKey. */
export type ProviderMeta = {
  id: string;
  alias: string;
  type: ProviderConfig["type"];
  model?: string;
  /** Required for openai-compatible providers. */
  baseUrl?: string;
};

export type ImageConfig = {
  id?: string;
  baseUrl?: string;
  model?: string;
  authMode?: ImageAuthMode;
  size?: string;
  batchCount?: number;
  responseFormat?: "url" | "b64_json";
};

export type ImageModelMeta = {
  id: string;
  baseUrl?: string;
  model?: string;
  authMode?: ImageAuthMode;
  responseFormat?: "url" | "b64_json";
};

export type ImagePromptHistoryEntry = {
  prompt: string;
  createdAt: number;
};

export class SettingsRepository {
  constructor(private readonly host: IHostAdapter) {}

  // Provider list metadata, excluding API keys.

  getProviders(): ProviderMeta[] {
    return this.host.getState<ProviderMeta[]>(KEYS.PROVIDERS) ?? [];
  }

  async saveProviders(providers: ProviderMeta[]): Promise<void> {
    await this.host.setState(KEYS.PROVIDERS, providers);
  }

  getActiveProviderId(): string | undefined {
    return this.host.getState<string>(KEYS.ACTIVE_PROVIDER_ID);
  }

  async setActiveProviderId(id: string): Promise<void> {
    await this.host.setState(KEYS.ACTIVE_PROVIDER_ID, id);
  }

  getActiveProviderMeta(): ProviderMeta | undefined {
    const activeId = this.getActiveProviderId();
    if (!activeId) {
      return undefined;
    }
    return this.getProviders().find(provider => provider.id === activeId);
  }

  async updateProviderMeta(
    providerId: string,
    updates: Partial<ProviderMeta>,
  ): Promise<ProviderMeta | undefined> {
    const providers = this.getProviders();
    const providerIndex = providers.findIndex(provider => provider.id === providerId);
    if (providerIndex === -1) {
      return undefined;
    }

    const currentProvider = providers[providerIndex];
    const nextProvider: ProviderMeta = {
      ...currentProvider,
      ...updates,
      id: currentProvider.id,
    };
    providers[providerIndex] = nextProvider;
    await this.saveProviders(providers);
    return nextProvider;
  }

  async setActiveProviderModel(model: string): Promise<ProviderMeta | undefined> {
    const activeProvider = this.getActiveProviderMeta();
    if (!activeProvider) {
      return undefined;
    }

    return this.updateProviderMeta(activeProvider.id, { model });
  }

  // API keys are stored in secrets.

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.host.getSecret(`cain.apiKey.${providerId}`);
  }

  async storeApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.host.storeSecret(`cain.apiKey.${providerId}`, apiKey);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    await this.host.deleteSecret(`cain.apiKey.${providerId}`);
  }

  private getImageModelSecretKey(imageModelId: string): string {
    return `cain.imageApiKey.${imageModelId}`;
  }

  private hasImageModelFields(meta: Partial<ImageModelMeta>): boolean {
    return Boolean(
      meta.baseUrl?.trim() ||
      meta.model?.trim() ||
      meta.authMode ||
      meta.responseFormat,
    );
  }

  private normalizeImageModelMeta(meta: ImageModelMeta): ImageModelMeta {
    return {
      id: meta.id,
      ...(meta.baseUrl?.trim() ? { baseUrl: meta.baseUrl.trim() } : {}),
      ...(meta.model?.trim() ? { model: meta.model.trim() } : {}),
      ...(meta.authMode ? { authMode: meta.authMode } : {}),
      ...(meta.responseFormat ? { responseFormat: meta.responseFormat } : {}),
    };
  }

  private getLegacyImageConfig(): ImageConfig | undefined {
    return this.host.getState<ImageConfig>(KEYS.IMAGE_CONFIG);
  }

  getImageModels(): ImageModelMeta[] {
    const stored = this.host.getState<ImageModelMeta[]>(KEYS.IMAGE_MODELS);
    if (Array.isArray(stored)) {
      return stored
        .filter(model => model && typeof model.id === "string" && model.id.trim())
        .map(model => this.normalizeImageModelMeta(model as ImageModelMeta));
    }

    const legacy = this.getLegacyImageConfig();
    if (!legacy) {
      return [];
    }

    return [{
      id: "default-image-model",
      ...(legacy.baseUrl?.trim() ? { baseUrl: legacy.baseUrl.trim() } : {}),
      ...(legacy.model?.trim() ? { model: legacy.model.trim() } : {}),
      ...(legacy.authMode ? { authMode: legacy.authMode } : {}),
      ...(legacy.responseFormat ? { responseFormat: legacy.responseFormat } : {}),
    }];
  }

  async saveImageModels(models: ImageModelMeta[]): Promise<void> {
    await this.host.setState(
      KEYS.IMAGE_MODELS,
      models.map(model => this.normalizeImageModelMeta(model)),
    );
  }

  getActiveImageModelId(): string | undefined {
    const activeId = this.host.getState<string>(KEYS.ACTIVE_IMAGE_MODEL_ID);
    if (activeId?.trim()) {
      return activeId.trim();
    }

    return this.getImageModels()[0]?.id;
  }

  async setActiveImageModelId(id: string): Promise<void> {
    await this.host.setState(KEYS.ACTIVE_IMAGE_MODEL_ID, id);
  }

  getActiveImageModelMeta(): ImageModelMeta | undefined {
    const activeId = this.getActiveImageModelId();
    if (!activeId) {
      return undefined;
    }

    return this.getImageModels().find(model => model.id === activeId);
  }

  getImageConfig(): ImageConfig | undefined {
    const activeModel = this.getActiveImageModelMeta();
    const legacy = this.getLegacyImageConfig();
    const source = activeModel ?? legacy;
    if (!source) {
      return undefined;
    }

    return {
      ...(activeModel ? { id: activeModel.id } : {}),
      ...(source.baseUrl ? { baseUrl: source.baseUrl } : {}),
      ...(source.model ? { model: source.model } : {}),
      ...(source.authMode ? { authMode: source.authMode } : {}),
      ...(legacy?.size ? { size: legacy.size } : {}),
      ...(legacy?.batchCount ? { batchCount: legacy.batchCount } : {}),
      ...(source.responseFormat ? { responseFormat: source.responseFormat } : {}),
    };
  }

  async saveImageConfig(config: ImageConfig): Promise<void> {
    const targetId = config.id?.trim() || this.getActiveImageModelId() || "default-image-model";
    const models = this.getImageModels();
    const legacy = this.getLegacyImageConfig();
    const currentMeta = models.find(model => model.id === targetId);
    const nextMeta: ImageModelMeta = this.normalizeImageModelMeta({
      id: targetId,
      baseUrl: config.baseUrl ?? currentMeta?.baseUrl,
      model: config.model ?? currentMeta?.model,
      authMode: config.authMode ?? currentMeta?.authMode,
      responseFormat: config.responseFormat ?? currentMeta?.responseFormat,
    });
    const targetIndex = models.findIndex(model => model.id === targetId);
    if (targetIndex >= 0) {
      models[targetIndex] = nextMeta;
    } else if (this.hasImageModelFields(nextMeta)) {
      models.push(nextMeta);
    }
    await this.saveImageModels(models);
    if (targetIndex >= 0 || this.hasImageModelFields(nextMeta)) {
      await this.setActiveImageModelId(targetId);
    }

    await this.host.setState(KEYS.IMAGE_CONFIG, {
      ...(config.size?.trim()
        ? { size: config.size.trim() }
        : legacy?.size?.trim()
          ? { size: legacy.size.trim() }
          : {}),
      ...(typeof config.batchCount === "number"
        ? { batchCount: config.batchCount }
        : typeof legacy?.batchCount === "number"
          ? { batchCount: legacy.batchCount }
          : {}),
      ...(config.responseFormat
        ? { responseFormat: config.responseFormat }
        : legacy?.responseFormat
          ? { responseFormat: legacy.responseFormat }
          : {}),
    });
  }

  async getImageApiKey(): Promise<string | undefined> {
    const activeId = this.getActiveImageModelId();
    if (activeId) {
      const scoped = await this.host.getSecret(this.getImageModelSecretKey(activeId));
      if (scoped) {
        return scoped;
      }
    }

    return this.host.getSecret("cain.imageApiKey");
  }

  async storeImageApiKey(apiKey: string): Promise<void> {
    const activeId = this.getActiveImageModelId();
    if (activeId) {
      await this.host.storeSecret(this.getImageModelSecretKey(activeId), apiKey);
      return;
    }

    await this.host.storeSecret("cain.imageApiKey", apiKey);
  }

  async deleteImageApiKey(): Promise<void> {
    const activeId = this.getActiveImageModelId();
    if (activeId) {
      await this.host.deleteSecret(this.getImageModelSecretKey(activeId));
    }
    await this.host.deleteSecret("cain.imageApiKey");
  }

  async getImageModelApiKey(imageModelId: string): Promise<string | undefined> {
    const trimmed = imageModelId.trim();
    if (!trimmed) {
      return undefined;
    }

    return this.host.getSecret(this.getImageModelSecretKey(trimmed));
  }

  async storeImageModelApiKey(imageModelId: string, apiKey: string): Promise<void> {
    const trimmed = imageModelId.trim();
    if (!trimmed) {
      return;
    }

    await this.host.storeSecret(this.getImageModelSecretKey(trimmed), apiKey);
  }

  async deleteImageModelApiKey(imageModelId: string): Promise<void> {
    const trimmed = imageModelId.trim();
    if (!trimmed) {
      return;
    }

    await this.host.deleteSecret(this.getImageModelSecretKey(trimmed));
  }

  async deleteImageModel(imageModelId: string): Promise<void> {
    const trimmed = imageModelId.trim();
    if (!trimmed) {
      return;
    }

    const nextModels = this.getImageModels().filter(model => model.id !== trimmed);
    await this.saveImageModels(nextModels);
    await this.deleteImageModelApiKey(trimmed);

    if (this.getActiveImageModelId() === trimmed) {
      await this.setActiveImageModelId(nextModels[0]?.id ?? "");
    }

    if (nextModels.length === 0) {
      await this.host.setState(KEYS.IMAGE_CONFIG, {});
      await this.deleteImageApiKey();
    }
  }

  async clearImageSettings(): Promise<void> {
    const imageModels = this.getImageModels();
    for (const imageModel of imageModels) {
      await this.deleteImageModelApiKey(imageModel.id);
    }

    await this.saveImageModels([]);
    await this.setActiveImageModelId("");
    await this.host.setState(KEYS.IMAGE_CONFIG, {});
    await this.host.deleteSecret("cain.imageApiKey");
  }

  getImagePromptHistory(): ImagePromptHistoryEntry[] {
    return this.host.getState<ImagePromptHistoryEntry[]>(KEYS.IMAGE_PROMPT_HISTORY) ?? [];
  }

  async saveImagePromptHistory(entries: ImagePromptHistoryEntry[]): Promise<void> {
    await this.host.setState(KEYS.IMAGE_PROMPT_HISTORY, entries.slice(0, 30));
  }

  async pushImagePromptHistory(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const deduped = this.getImagePromptHistory().filter(entry => entry.prompt !== trimmed);
    deduped.unshift({
      prompt: trimmed,
      createdAt: Date.now(),
    });
    await this.saveImagePromptHistory(deduped);
  }

  // Rebuild a full ProviderConfig, including API key when required.

  async getProviderConfig(providerId: string): Promise<ProviderConfig | undefined> {
    const meta = this.getProviders().find(p => p.id === providerId);
    if (!meta) {
      return undefined;
    }

    const apiKey = await this.getApiKey(providerId);

    if (meta.type === "claude-cli") {
      return { type: "claude-cli", model: meta.model };
    }

    if (!apiKey) {
      return undefined;
    }

    if (meta.type === "openai-compatible") {
      if (!meta.baseUrl) {
        throw new Error(`Provider "${meta.alias}" 缺少 baseUrl，请在设置面板填写 API 端点地址。`);
      }
      return {
        type: "openai-compatible",
        apiKey,
        model: meta.model ?? "",
        baseUrl: meta.baseUrl,
      };
    }

    if (meta.type === "openai") {
      return { type: "openai", apiKey, model: meta.model ?? "", baseUrl: meta.baseUrl };
    }

    return { type: "anthropic", apiKey, model: meta.model ?? "", baseUrl: meta.baseUrl };
  }

  async getProviderConfigByAlias(alias: string): Promise<ProviderConfig | undefined> {
    const providers = this.getProviders();
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) {
      return undefined;
    }

    const exactMeta = providers.find(provider => provider.alias === trimmedAlias);
    if (exactMeta) {
      return this.getProviderConfig(exactMeta.id);
    }

    const normalizedAlias = normalizeProviderAlias(trimmedAlias);
    const normalizedMeta = providers.find(
      provider => normalizeProviderAlias(provider.alias) === normalizedAlias,
    );
    if (normalizedMeta) {
      return this.getProviderConfig(normalizedMeta.id);
    }

    const claudeLikeAlias = [
      "anthropic",
      "claude",
      "claudesonnet",
      "sonnet",
      "claudeopus",
      "opus",
      "claudehaiku",
      "haiku",
    ].includes(normalizedAlias);

    if (claudeLikeAlias) {
      const activeProvider = this.getActiveProviderMeta();
      if (activeProvider && metaLooksClaudeLike(activeProvider)) {
        return this.getProviderConfig(activeProvider.id);
      }

      const fallbackProvider = providers.find(metaLooksClaudeLike);
      if (fallbackProvider) {
        return this.getProviderConfig(fallbackProvider.id);
      }
    }

    return undefined;
  }

  async getActiveProviderConfig(): Promise<ProviderConfig | undefined> {
    const id = this.getActiveProviderId();
    if (!id) {
      return undefined;
    }
    return this.getProviderConfig(id);
  }

  // Other small persisted flags/state.

  isOnboardingDone(): boolean {
    return this.host.getState<boolean>(KEYS.ONBOARDING_DONE) ?? false;
  }

  async setOnboardingDone(done: boolean): Promise<void> {
    await this.host.setState(KEYS.ONBOARDING_DONE, done);
  }

  isLicenseActivated(): boolean {
    return this.host.getState<boolean>(KEYS.LICENSE_ACTIVATED) ?? false;
  }

  async setLicenseActivated(activated: boolean): Promise<void> {
    await this.host.setState(KEYS.LICENSE_ACTIVATED, activated);
  }

  getActiveSessionId(): string | undefined {
    return this.host.getState<string>(KEYS.ACTIVE_SESSION_ID);
  }

  async setActiveSessionId(id: string): Promise<void> {
    await this.host.setState(KEYS.ACTIVE_SESSION_ID, id);
  }

  getEffortLevel(): EffortLevel | undefined {
    return this.host.getState<EffortLevel>(KEYS.EFFORT_LEVEL);
  }

  async setEffortLevel(level: EffortLevel | undefined): Promise<void> {
    await this.host.setState(KEYS.EFFORT_LEVEL, level);
  }

  getFastMode(): boolean {
    return this.host.getState<boolean>(KEYS.FAST_MODE) === true;
  }

  async setFastMode(enabled: boolean): Promise<void> {
    await this.host.setState(KEYS.FAST_MODE, enabled);
  }

  getShowThinkingSummaries(): boolean {
    const stored = this.host.getState<boolean>(KEYS.SHOW_THINKING_SUMMARIES);
    return stored !== false;
  }

  async setShowThinkingSummaries(enabled: boolean): Promise<void> {
    await this.host.setState(KEYS.SHOW_THINKING_SUMMARIES, enabled);
  }

  getLanguage(): AppLanguage {
    return normalizeAppLanguage(this.host.getState<string>(KEYS.UI_LANGUAGE));
  }

  async setLanguage(language: string): Promise<void> {
    await this.host.setState(KEYS.UI_LANGUAGE, normalizeAppLanguage(language));
  }

  getWorkspaceRoot(): string | undefined {
    return this.host.getState<string>(KEYS.WORKSPACE_ROOT);
  }

  async setWorkspaceRoot(root: string): Promise<void> {
    await this.host.setState(KEYS.WORKSPACE_ROOT, root);
  }
}
