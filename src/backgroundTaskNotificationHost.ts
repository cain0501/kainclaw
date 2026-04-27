import path from "node:path";

import type { AssistantReplyBindings } from "./assistantReplyHost";
import type { BackgroundTaskRecord, ConversationTaskRuntime } from "./tasks/types";

const BACKGROUND_TASK_NOTIFICATION_PREVIEW_LIMIT = 300;

export type BackgroundTaskNotificationBindings = {
  pollBackgroundTaskNotifications: () => Promise<number>;
};

function truncateNotificationText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= BACKGROUND_TASK_NOTIFICATION_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, BACKGROUND_TASK_NOTIFICATION_PREVIEW_LIMIT)}...`;
}

function formatNotificationLabel(task: BackgroundTaskRecord): string {
  return task.command?.trim() || task.description.trim() || task.id;
}

function getRemoteTaskType(task: BackgroundTaskRecord): string | undefined {
  const value = task.metadata?.remoteTaskType;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatTaskTerminalState(task: BackgroundTaskRecord): string {
  switch (task.status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "killed":
      return "was stopped";
    case "cancelled":
      return "was cancelled";
    case "lost":
      return "was interrupted after a runtime restart";
    default:
      return task.status;
  }
}

export function shouldNotifyBackgroundTask(
  task: BackgroundTaskRecord,
): boolean {
  if (task.notified) {
    return false;
  }

  if (task.taskType === "built_in_agent") {
    return false;
  }

  return (
    task.status === "completed" ||
    task.status === "failed" ||
    task.status === "killed" ||
    task.status === "cancelled" ||
    task.status === "lost"
  );
}

export function formatBackgroundTaskNotification(
  task: BackgroundTaskRecord,
): string {
  if (
    task.taskType === "remote_agent" &&
    getRemoteTaskType(task) === "claude_cli_review"
  ) {
    return formatHostedReviewNotification(task);
  }
  if (
    task.taskType === "remote_agent" &&
    getRemoteTaskType(task) === "claude_cli_verification"
  ) {
    return formatHostedVerificationNotification(task);
  }

  const label = formatNotificationLabel(task);
  const taskKind =
    task.taskType === "remote_agent" ? "Remote task" : "Background task";
  const lines = [`${taskKind} ${formatTaskTerminalState(task)}: ${label}`];

  if (typeof task.metadata?.sessionUrl === "string" && task.metadata.sessionUrl.trim()) {
    lines.push(`Remote session: ${task.metadata.sessionUrl.trim()}`);
  } else if (typeof task.metadata?.sessionId === "string" && task.metadata.sessionId.trim()) {
    lines.push(`Remote session: ${task.metadata.sessionId.trim()}`);
  }

  if (typeof task.outputPath === "string" && task.outputPath.trim()) {
    lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
  }

  if (task.status === "failed" && task.error?.trim()) {
    lines.push(`Error: ${truncateNotificationText(task.error)}`);
  } else if (task.status === "lost") {
    lines.push("Re-run this task if you still need fresh output.");
  } else if (task.result?.trim()) {
    lines.push(`Result: ${truncateNotificationText(task.result)}`);
  }

  return lines.join("\n");
}

function formatHostedReviewNotification(task: BackgroundTaskRecord): string {
  const label = formatNotificationLabel(task);
  const lines: string[] = [];

  switch (task.status) {
    case "completed": {
      lines.push(`Hosted review completed: ${label}`);
      if (typeof task.outputPath === "string" && task.outputPath.trim()) {
        lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
      }
      const report = task.result?.trim() || task.output.trim();
      if (report) {
        lines.push("");
        lines.push(report);
      } else {
        lines.push("");
        lines.push(
          "Hosted review completed, but no report was captured. Check the output file and rerun `/ultrareview` if needed.",
        );
      }
      return lines.join("\n");
    }
    case "failed":
      lines.push(`Hosted review failed: ${label}`);
      if (typeof task.outputPath === "string" && task.outputPath.trim()) {
        lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
      }
      if (task.error?.trim()) {
        lines.push(`Error: ${task.error.trim()}`);
      }
      lines.push("Retry `/ultrareview`, or use `/review` for a local review.");
      return lines.join("\n");
    case "killed":
      lines.push(`Hosted review was stopped: ${label}`);
      break;
    case "cancelled":
      lines.push(`Hosted review was cancelled: ${label}`);
      break;
    case "lost":
      lines.push(`Hosted review was interrupted after a runtime restart: ${label}`);
      break;
    default:
      lines.push(`Hosted review update: ${label}`);
      break;
  }

  if (typeof task.outputPath === "string" && task.outputPath.trim()) {
    lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
  }

  return lines.join("\n");
}

function formatHostedVerificationNotification(task: BackgroundTaskRecord): string {
  const label = formatNotificationLabel(task);
  const lines: string[] = [];

  switch (task.status) {
    case "completed": {
      lines.push(`Hosted verification completed: ${label}`);
      if (typeof task.outputPath === "string" && task.outputPath.trim()) {
        lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
      }
      const report = task.result?.trim() || task.output.trim();
      if (report) {
        lines.push("");
        lines.push(report);
      } else {
        lines.push("");
        lines.push(
          "Hosted verification completed, but no report was captured. Check the output file and rerun `/ultraverify` if needed.",
        );
      }
      return lines.join("\n");
    }
    case "failed": {
      lines.push(`Hosted verification finished with issues: ${label}`);
      if (typeof task.outputPath === "string" && task.outputPath.trim()) {
        lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
      }
      const report = task.result?.trim();
      if (report) {
        lines.push("");
        lines.push(report);
        return lines.join("\n");
      }
      if (task.error?.trim()) {
        lines.push(`Error: ${task.error.trim()}`);
      }
      lines.push("Retry `/ultraverify`, or use `/verify` for a local verification run.");
      return lines.join("\n");
    }
    case "killed":
      lines.push(`Hosted verification was stopped: ${label}`);
      break;
    case "cancelled":
      lines.push(`Hosted verification was cancelled: ${label}`);
      break;
    case "lost":
      lines.push(`Hosted verification was interrupted after a runtime restart: ${label}`);
      break;
    default:
      lines.push(`Hosted verification update: ${label}`);
      break;
  }

  if (typeof task.outputPath === "string" && task.outputPath.trim()) {
    lines.push(`Output file: ${path.normalize(task.outputPath.trim())}`);
  }

  return lines.join("\n");
}

export function createBackgroundTaskNotificationBindings(options: {
  getTaskRuntime: () => ConversationTaskRuntime | undefined;
  recordAssistantReply: AssistantReplyBindings["recordAssistantReply"];
}): BackgroundTaskNotificationBindings {
  let inFlight: Promise<number> | undefined;

  const poll = async (): Promise<number> => {
    const runtime = options.getTaskRuntime();
    if (!runtime) {
      return 0;
    }

    const tasks = await runtime.listBackgroundTasks();
    const ready = tasks
      .filter(shouldNotifyBackgroundTask)
      .sort((left, right) => left.updatedAt - right.updatedAt);

    let delivered = 0;
    for (const task of ready) {
      await options.recordAssistantReply(
        formatBackgroundTaskNotification(task),
        false,
      );
      if (typeof runtime.markBackgroundTaskNotified === "function") {
        await runtime.markBackgroundTaskNotified(task.id);
      } else {
        await runtime.updateBackgroundTask(task.id, { notified: true });
      }
      delivered += 1;
    }

    return delivered;
  };

  return {
    pollBackgroundTaskNotifications: async () => {
      if (inFlight) {
        return inFlight;
      }

      const operation = poll().finally(() => {
        if (inFlight === operation) {
          inFlight = undefined;
        }
      });
      inFlight = operation;
      return operation;
    },
  };
}
