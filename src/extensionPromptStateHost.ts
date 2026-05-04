import type { ExtensionPromptRequestState } from "./extensionPromptPartsHost";

type CreateExtensionPromptRequestStateOptions = {
  getCurrentSessionId: ExtensionPromptRequestState["getCurrentSessionId"];
  setCurrentSessionId: ExtensionPromptRequestState["setCurrentSessionId"];
  sessionMessages: ExtensionPromptRequestState["sessionMessages"];
  conversationMessages: ExtensionPromptRequestState["conversationMessages"];
  getPendingPromptAttachments:
    ExtensionPromptRequestState["getPendingPromptAttachments"];
  setPendingPromptAttachments:
    ExtensionPromptRequestState["setPendingPromptAttachments"];
  pendingPlanVerification: ExtensionPromptRequestState["pendingPlanVerification"];
  planModeState: ExtensionPromptRequestState["planModeState"];
  getSwarm: ExtensionPromptRequestState["getSwarm"];
  setSwarm: ExtensionPromptRequestState["setSwarm"];
  queueAutoMemoryExtraction:
    ExtensionPromptRequestState["queueAutoMemoryExtraction"];
  getSessionInstalledSkillHooks: NonNullable<
    ExtensionPromptRequestState["getSessionInstalledSkillHooks"]
  >;
  registerSessionInstalledSkillHooks: NonNullable<
    ExtensionPromptRequestState["registerSessionInstalledSkillHooks"]
  >;
  cachedTools: ExtensionPromptRequestState["cachedTools"];
  cachedToolsWorkspaceRoot:
    ExtensionPromptRequestState["cachedToolsWorkspaceRoot"];
  setWorkspaceToolCache: ExtensionPromptRequestState["setWorkspaceToolCache"];
  appendStreamingText: ExtensionPromptRequestState["appendStreamingText"];
  clearStreamingText: ExtensionPromptRequestState["clearStreamingText"];
};

export function createExtensionPromptRequestState(
  options: CreateExtensionPromptRequestStateOptions,
): ExtensionPromptRequestState {
  return {
    getCurrentSessionId: options.getCurrentSessionId,
    setCurrentSessionId: options.setCurrentSessionId,
    sessionMessages: options.sessionMessages,
    conversationMessages: options.conversationMessages,
    getPendingPromptAttachments: options.getPendingPromptAttachments,
    setPendingPromptAttachments: options.setPendingPromptAttachments,
    pendingPlanVerification: options.pendingPlanVerification,
    planModeState: options.planModeState,
    getSwarm: options.getSwarm,
    setSwarm: options.setSwarm,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
    getSessionInstalledSkillHooks: options.getSessionInstalledSkillHooks,
    registerSessionInstalledSkillHooks:
      options.registerSessionInstalledSkillHooks,
    cachedTools: options.cachedTools,
    cachedToolsWorkspaceRoot: options.cachedToolsWorkspaceRoot,
    setWorkspaceToolCache: options.setWorkspaceToolCache,
    appendStreamingText: options.appendStreamingText,
    clearStreamingText: options.clearStreamingText,
  };
}
