import { randomUUID } from "node:crypto";

import { getToolRunningLabel } from "./hostUi";
import { describeToolInput, describeToolName } from "./hostRuntimeHelpers";
import type { ToolLifecycleEvent } from "./toolRuntime";

const MAX_LIVE_ACTIVITIES = 10;
const MAX_LAST_RUN_ACTIVITIES = 8;

export type ActivityEntry = {
  id: string;
  kind: "phase" | "tool" | "approval";
  label: string;
  detail?: string;
  status: "running" | "done" | "error" | "waiting";
};

type ActivityTrackerOptions = {
  createId?: () => string;
  onChange?: () => void;
  onWorktreeToolSuccess?: () => void;
  onMcpAuthToolSuccess?: () => void;
};

export class ActivityTracker {
  private live: ActivityEntry[] = [];
  private lastRun: ActivityEntry[] = [];
  private readonly runningToolActivityIds = new Map<string, string>();

  constructor(private readonly options: ActivityTrackerOptions = {}) {}

  get liveActivities(): ActivityEntry[] {
    return this.live;
  }

  get lastRunActivities(): ActivityEntry[] {
    return this.lastRun;
  }

  add(
    kind: ActivityEntry["kind"],
    label: string,
    detail?: string,
    status: ActivityEntry["status"] = "running",
  ): string {
    const id = this.options.createId?.() ?? randomUUID();
    this.live.push({ id, kind, label, detail, status });
    this.live = this.live.slice(-MAX_LIVE_ACTIVITIES);
    this.emitChange();
    return id;
  }

  finish(id: string, status: ActivityEntry["status"], detail?: string): void {
    const activity = this.live.find(item => item.id === id);
    if (!activity) {
      return;
    }

    activity.status = status;
    if (detail !== undefined) {
      activity.detail = detail;
    }
    this.emitChange();
  }

  reset(): void {
    this.live = [];
    this.lastRun = [];
    this.runningToolActivityIds.clear();
    this.emitChange();
  }

  archiveCurrentRun(): void {
    this.lastRun = this.live.slice(-MAX_LAST_RUN_ACTIVITIES);
    this.live = [];
    this.runningToolActivityIds.clear();
    this.emitChange();
  }

  startToolExecution(executionId: string, label: string, detail?: string): string {
    const activityId = this.add("tool", label, detail, "running");
    this.runningToolActivityIds.set(executionId, activityId);
    return activityId;
  }

  finishToolExecution(
    executionId: string,
    status: Extract<ActivityEntry["status"], "done" | "error">,
    detail?: string,
  ): void {
    const activityId = this.runningToolActivityIds.get(executionId);
    if (!activityId) {
      return;
    }

    this.runningToolActivityIds.delete(executionId);
    this.finish(activityId, status, detail);
  }

  handleToolLifecycle(event: ToolLifecycleEvent): void {
    if (event.phase === "start") {
      this.startToolExecution(
        event.executionId,
        getToolRunningLabel(describeToolName(event.toolName)),
        describeToolInput(event.input),
      );
      return;
    }

    if (event.outcome === "success" && isWorktreeLifecycleTool(event.toolName)) {
      this.options.onWorktreeToolSuccess?.();
    }
    if (event.outcome === "success" && isMcpAuthLifecycleTool(event.toolName)) {
      this.options.onMcpAuthToolSuccess?.();
    }

    this.finishToolExecution(
      event.executionId,
      event.outcome === "error" ? "error" : "done",
      event.outcome === "error" ? event.error : event.summary,
    );
  }

  private emitChange(): void {
    this.options.onChange?.();
  }
}

function isWorktreeLifecycleTool(toolName: string): boolean {
  return toolName === "EnterWorktree" || toolName === "ExitWorktree";
}

function isMcpAuthLifecycleTool(toolName: string): boolean {
  return /^mcp__.+__authenticate$/i.test(toolName);
}
