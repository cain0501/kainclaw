import { SYSTEM_PROMPT } from "./agent/agentRunner";
import type {
  NormalizedImageAttachment,
  NormalizedMessage,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import { getAutoMemoryDir, readAutoMemoryEntrypoint } from "./autoMemory/paths";
import { buildAutoMemorySystemPrompt } from "./autoMemory/prompt";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import { buildContextSystemPrompt, loadContextConfig } from "./contextRegistry";
import {
  buildInstalledSkillsSystemPrompt,
  loadModelInvocableInstalledSkills,
} from "./installedSkillModelRegistry";
import { buildPlanModeSystemPrompt } from "./planMode/planModePrompt";
import { buildThinkingEffortSystemPrompt } from "./thinkingEffort/prompt";
import type { ProviderRuntimeOptions, EffortLevel } from "./thinkingEffort/types";
import { buildPendingPlanVerificationSystemPrompt } from "./verification/prompt";
import type { ProfileStore } from "./userModel/profileStore";

type PromptTurnConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: NormalizedImageAttachment[];
};

export async function applyPromptTurnUserContext(options: {
  prompt: string;
  attachments?: NormalizedImageAttachment[];
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  appendConversationMessage: (message: PromptTurnConversationMessage) => void;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  persistCurrentSessionRuntimeState: () => void;
  maybeAutoCompactConversation: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<void>;
}): Promise<void> {
  options.appendConversationMessage({
    role: "user",
    content: options.prompt,
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
  });

  const mentionContext = await options.buildPromptFileMentionContext({
    prompt: options.prompt,
    workspaceRoot: options.workspaceRoot,
  });
  if (mentionContext.supplementalPrompt) {
    options.appendConversationMessage({
      role: "user",
      content: mentionContext.supplementalPrompt,
    });
  }

  options.persistCurrentSessionRuntimeState();
  await options.maybeAutoCompactConversation(
    options.workspaceRoot,
    options.config,
    options.envMap,
  );
}

export async function buildWorkspaceSystemPrompt(options: {
  workspaceRoot: string;
  config: AdapterProviderConfig;
  effortLevel: EffortLevel | undefined;
  planModeState: {
    active: boolean;
    planFilePath?: string;
  };
  pendingPlanVerification: PendingPlanVerificationState | undefined;
  pendingPlanVerificationReminderTurns: number | null;
  getPlanContent: (workspaceRoot: string) => Promise<string | null>;
  profileStore?: ProfileStore;
}): Promise<string> {
  let systemPrompt = buildAutoMemorySystemPrompt(SYSTEM_PROMPT, {
    memoryDir: getAutoMemoryDir(options.workspaceRoot),
    entrypointContent: await readAutoMemoryEntrypoint(options.workspaceRoot),
  });

  if (options.profileStore) {
    const profileContent = await options.profileStore.load();
    if (profileContent?.trim()) {
      systemPrompt = `${systemPrompt}\n\n<user_profile>\n${profileContent.trim()}\n</user_profile>`;
    }
  }

  systemPrompt = buildContextSystemPrompt(systemPrompt, {
    workspaceRoot: options.workspaceRoot,
    extraDirectories: (await loadContextConfig(options.workspaceRoot)).extraDirectories,
  });

  systemPrompt = buildInstalledSkillsSystemPrompt(
    systemPrompt,
    await loadModelInvocableInstalledSkills(options.workspaceRoot),
  );

  if (options.planModeState.active && options.planModeState.planFilePath) {
    const planContent = await options.getPlanContent(options.workspaceRoot);
    systemPrompt = buildPlanModeSystemPrompt(systemPrompt, {
      planFilePath: options.planModeState.planFilePath,
      planHasContent: !!planContent?.trim(),
    });
  }

  if (
    options.pendingPlanVerification &&
    options.pendingPlanVerificationReminderTurns !== null
  ) {
    systemPrompt = buildPendingPlanVerificationSystemPrompt(systemPrompt, {
      planFilePath: options.pendingPlanVerification.planFilePath,
      turnsSinceApproval: options.pendingPlanVerificationReminderTurns,
    });
  }

  return buildThinkingEffortSystemPrompt(
    systemPrompt,
    options.config,
    options.effortLevel,
  );
}

export function createWorkspaceSystemPromptBuilder(options: {
  planModeState: {
    active: boolean;
    planFilePath?: string;
  };
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  getPendingPlanVerificationReminderTurns: () => number | null;
  getPlanContent: (workspaceRoot: string) => Promise<string | null>;
  profileStore?: ProfileStore;
}): (
  workspaceRoot: string,
  config: AdapterProviderConfig,
  effortLevel: EffortLevel | undefined,
) => Promise<string> {
  return (workspaceRoot, config, effortLevel) =>
    buildWorkspaceSystemPrompt({
      workspaceRoot,
      config,
      effortLevel,
      planModeState: options.planModeState,
      pendingPlanVerification: options.getPendingPlanVerification(),
      pendingPlanVerificationReminderTurns:
        options.getPendingPlanVerificationReminderTurns(),
      getPlanContent: options.getPlanContent,
      profileStore: options.profileStore,
    });
}

export async function preparePromptTurnDependencies<TProvider>(options: {
  prompt: string;
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  getConversationHistory: () => NormalizedMessage[];
  getSystemPromptForWorkspace: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProvider: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => TProvider;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
}): Promise<{
  history: NormalizedMessage[];
  provider: TProvider;
  swarmEnabledForTurn: boolean;
}> {
  const history = options.getConversationHistory();
  const systemPrompt = await options.getSystemPromptForWorkspace(
    options.workspaceRoot,
    options.config,
    options.effortLevel,
  );
  const provider = options.buildProvider({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    systemPrompt,
    envMap: options.envMap,
    runtimeOptions: options.runtimeOptions,
  });

  return {
    history,
    provider,
    swarmEnabledForTurn: options.shouldEnableSwarmForPrompt(options.prompt),
  };
}
