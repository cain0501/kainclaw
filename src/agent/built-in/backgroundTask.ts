import { randomUUID } from "node:crypto";
import type { BuiltInAgentDefinition } from "./types";
import type { BackgroundTaskRecord, BackgroundTaskType } from "../../tasks/types";

export const BUILT_IN_AGENT_BACKGROUND_TASK_TYPE: BackgroundTaskType = "built_in_agent";

export function getBuiltInAgentBackgroundTaskMetadata(
  agent: BuiltInAgentDefinition,
  metadata?: Record<string, unknown>,
): Pick<BackgroundTaskRecord, "taskType" | "agentType" | "agentSource" | "agentColor" | "metadata"> {
  return {
    taskType: BUILT_IN_AGENT_BACKGROUND_TASK_TYPE,
    agentType: agent.agentType,
    agentSource: agent.source,
    agentColor: agent.color,
    ...(metadata ? { metadata } : {}),
  };
}

export function createBuiltInAgentTaskId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function buildBuiltInAgentTaskDescription(
  agentLabel: string,
  extraGuidance?: string,
): string {
  if (!extraGuidance?.trim()) {
    return agentLabel;
  }

  const compactGuidance = extraGuidance.trim().replace(/\s+/g, " ");
  if (compactGuidance.length <= 80) {
    return `${agentLabel}: ${compactGuidance}`;
  }

  return `${agentLabel}: ${compactGuidance.slice(0, 77)}...`;
}

export function buildBuiltInAgentTaskStartOutput(
  agentLabel: string,
  commandText: string,
): string {
  return `Started ${agentLabel.toLowerCase()} for:\n${commandText.trim()}`;
}

export function formatBuiltInAgentToolEvent(
  phase: "start" | "end",
  toolName: string,
  detail?: string,
): string {
  const prefix = phase === "start" ? "[tool:start]" : "[tool:end]";
  const suffix = detail?.trim() ? ` ${detail.trim()}` : "";
  return `${prefix} ${toolName}${suffix}`;
}
