import type { ChatMessage } from "./storage/sessionRepository";
import {
  countConversationUserTurnsForPlanReminder,
  type PendingPlanVerificationState,
} from "./conversationRuntimeStateHost";
import { getHistoryCommandBehavior } from "./conversationHistoryHost";
import {
  ensurePlanFile,
  readPlanFile,
  type PlanModeState,
} from "./planMode/planMode";

export function resetPlanModeState(): PlanModeState {
  return { active: false };
}

export async function enterPlanModeWithHost(options: {
  workspaceRoot: string;
  conversationKey: string;
  clearSwarm: () => void;
  clearPendingPlanVerification: () => void;
  setPlanModeState: (state: PlanModeState) => void;
  postState: () => void;
}): Promise<{ planFilePath: string; planContent: string }> {
  const planFile = await ensurePlanFile(
    options.workspaceRoot,
    options.conversationKey,
  );

  options.clearSwarm();
  options.clearPendingPlanVerification();
  options.setPlanModeState({
    active: true,
    planFilePath: planFile.relativePath,
    conversationKey: options.conversationKey,
  });
  options.postState();

  return {
    planFilePath: planFile.relativePath,
    planContent: planFile.content,
  };
}

export async function getPlanContentForWorkspace(options: {
  workspaceRoot: string;
  planModeState: PlanModeState;
}): Promise<string | null> {
  if (!options.planModeState.planFilePath) {
    return null;
  }

  return readPlanFile(
    options.workspaceRoot,
    options.planModeState.planFilePath,
  );
}

function buildPendingPlanVerificationState(options: {
  planFilePath: string;
  planContent: string;
  sessionMessages: ChatMessage[];
}): PendingPlanVerificationState {
  return {
    planFilePath: options.planFilePath,
    planContent: options.planContent,
    approvedAtUserTurnCount: countConversationUserTurnsForPlanReminder({
      sessionMessages: options.sessionMessages,
      getHistoryCommandBehavior,
    }),
    verificationStarted: false,
    verificationCompleted: false,
  };
}

export async function exitPlanModeWithHost(options: {
  workspaceRoot: string;
  planModeState: PlanModeState;
  sessionMessages: ChatMessage[];
  setPlanModeState: (state: PlanModeState) => void;
  setPendingPlanVerification: (
    state: PendingPlanVerificationState,
  ) => void;
  postState: () => void;
}): Promise<{ planFilePath: string; planContent: string }> {
  const planFilePath = options.planModeState.planFilePath;

  if (!planFilePath) {
    throw new Error("No active plan file found.");
  }

  const planContent = await getPlanContentForWorkspace({
    workspaceRoot: options.workspaceRoot,
    planModeState: options.planModeState,
  });
  if (!planContent || !planContent.trim()) {
    throw new Error(`No plan content found in ${planFilePath}.`);
  }

  options.setPlanModeState({
    active: false,
    planFilePath,
    conversationKey: options.planModeState.conversationKey,
  });
  options.setPendingPlanVerification(
    buildPendingPlanVerificationState({
      planFilePath,
      planContent,
      sessionMessages: options.sessionMessages,
    }),
  );
  options.postState();

  return {
    planFilePath,
    planContent,
  };
}
