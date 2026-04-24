import { randomUUID } from "node:crypto";

import { validateProviderKey } from "./providerValidation";
import type {
  ImageConfig,
  ImageModelMeta,
  ImagePromptHistoryEntry,
  ProviderMeta,
} from "./storage/settingsRepository";

type SettingsStore = {
  getProviders(): ProviderMeta[];
  saveProviders(providers: ProviderMeta[]): Promise<void>;
  getActiveProviderId(): string | undefined;
  setActiveProviderId(id: string): Promise<void>;
  getApiKey(providerId: string): Promise<string | undefined>;
  storeApiKey(providerId: string, apiKey: string): Promise<void>;
  deleteApiKey(providerId: string): Promise<void>;
  getImageConfig(): ImageConfig | undefined;
  saveImageConfig(config: ImageConfig): Promise<void>;
  getImageModels(): ImageModelMeta[];
  saveImageModels(models: ImageModelMeta[]): Promise<void>;
  getActiveImageModelId(): string | undefined;
  setActiveImageModelId(id: string): Promise<void>;
  getImageApiKey(): Promise<string | undefined>;
  storeImageApiKey(apiKey: string): Promise<void>;
  deleteImageApiKey(): Promise<void>;
  getImageModelApiKey(imageModelId: string): Promise<string | undefined>;
  storeImageModelApiKey(imageModelId: string, apiKey: string): Promise<void>;
  deleteImageModelApiKey(imageModelId: string): Promise<void>;
  deleteImageModel(imageModelId: string): Promise<void>;
  getImagePromptHistory(): ImagePromptHistoryEntry[];
  saveImagePromptHistory(entries: ImagePromptHistoryEntry[]): Promise<void>;
  isLicenseActivated(): boolean;
  setOnboardingDone(done: boolean): Promise<void>;
  getShowThinkingSummaries(): boolean;
};

export async function validateOnboardingProviderKey(options: {
  providerType: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await validateProviderKey(
      options.providerType,
      options.apiKey,
      options.baseUrl,
      options.model,
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function completeOnboardingProvider(options: {
  settings: SettingsStore;
  meta: ProviderMeta;
  apiKey: string;
  createId?: () => string;
}): Promise<{ providerId: string }> {
  const providerId = normalizeProviderId(options.meta.id, options.createId);
  const providerMeta: ProviderMeta = {
    ...options.meta,
    id: providerId,
  };

  await options.settings.saveProviders([
    ...options.settings.getProviders(),
    providerMeta,
  ]);
  await options.settings.storeApiKey(providerId, options.apiKey);
  await options.settings.setActiveProviderId(providerId);
  await options.settings.setOnboardingDone(true);

  return { providerId };
}

export async function loadSettingsPanelData(settings: SettingsStore): Promise<{
  providers: Array<ProviderMeta & { hasKey: boolean }>;
  activeId: string | undefined;
  licenseActivated: boolean;
  showThinkingSummaries: boolean;
  imageModels: Array<ImageModelMeta & { hasKey: boolean }>;
  activeImageModelId: string | undefined;
  imageConfig?: ImageConfig;
  imageHasKey: boolean;
  imagePromptHistory: ImagePromptHistoryEntry[];
}> {
  const providers = settings.getProviders();
  const providersWithKeyStatus = await Promise.all(
    providers.map(async provider => ({
      ...provider,
      hasKey: !!(await settings.getApiKey(provider.id)),
    })),
  );

  const imageModels = settings.getImageModels();
  const imageModelsWithKeyStatus = await Promise.all(
    imageModels.map(async imageModel => ({
      ...imageModel,
      hasKey: !!(await settings.getImageModelApiKey(imageModel.id)),
    })),
  );

  return {
    providers: providersWithKeyStatus,
    activeId: settings.getActiveProviderId(),
    licenseActivated: settings.isLicenseActivated(),
    showThinkingSummaries: settings.getShowThinkingSummaries(),
    imageModels: imageModelsWithKeyStatus,
    activeImageModelId: settings.getActiveImageModelId(),
    imageConfig: settings.getImageConfig(),
    imageHasKey: !!(await settings.getImageApiKey()),
    imagePromptHistory: settings.getImagePromptHistory(),
  };
}

export async function saveSettingsProvider(options: {
  settings: SettingsStore;
  meta: ProviderMeta;
  apiKey?: string;
  createId?: () => string;
}): Promise<{ providerId: string }> {
  const providerId = normalizeProviderId(options.meta.id, options.createId);
  const nextMeta: ProviderMeta = {
    ...options.meta,
    id: providerId,
  };
  const providers = options.settings.getProviders();
  const providerIndex = providers.findIndex(provider => provider.id === providerId);

  if (providerIndex >= 0) {
    providers[providerIndex] = nextMeta;
  } else {
    providers.push(nextMeta);
  }

  await options.settings.saveProviders(providers);
  if (options.apiKey) {
    await options.settings.storeApiKey(providerId, options.apiKey);
  }

  return { providerId };
}

export async function deleteSettingsProvider(options: {
  settings: SettingsStore;
  id: string;
}): Promise<{ nextActiveProviderId?: string }> {
  const providers = options.settings.getProviders().filter(provider => provider.id !== options.id);
  await options.settings.saveProviders(providers);
  await options.settings.deleteApiKey(options.id);

  let nextActiveProviderId: string | undefined;
  if (options.settings.getActiveProviderId() === options.id) {
    nextActiveProviderId = providers[0]?.id;
    await options.settings.setActiveProviderId(nextActiveProviderId ?? "");
  }

  return { nextActiveProviderId };
}

function normalizeProviderId(
  providerId: string | undefined,
  createId?: () => string,
): string {
  const trimmed = providerId?.trim();
  if (trimmed) {
    return trimmed;
  }

  return createId?.() ?? randomUUID();
}
