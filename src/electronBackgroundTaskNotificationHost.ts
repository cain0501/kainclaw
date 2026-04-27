import {
  formatBackgroundTaskNotification,
  shouldNotifyBackgroundTask,
} from "./backgroundTaskNotificationHost";
import type { ConversationTaskRuntime } from "./tasks/types";

export async function pollElectronBackgroundTaskNotifications(options: {
  getTaskRuntimes: () => Promise<ConversationTaskRuntime[]>;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
  ) => Promise<void>;
}): Promise<number> {
  const runtimes = await options.getTaskRuntimes();
  if (runtimes.length === 0) {
    return 0;
  }

  const seenTaskIds = new Set<string>();
  const ready: Array<{
    runtime: ConversationTaskRuntime;
    task: Awaited<ReturnType<ConversationTaskRuntime["listBackgroundTasks"]>>[number];
  }> = [];

  for (const runtime of runtimes) {
    const tasks = await runtime.listBackgroundTasks();
    for (const task of tasks) {
      if (!shouldNotifyBackgroundTask(task) || seenTaskIds.has(task.id)) {
        continue;
      }
      seenTaskIds.add(task.id);
      ready.push({ runtime, task });
    }
  }

  ready.sort((left, right) => left.task.updatedAt - right.task.updatedAt);

  let delivered = 0;
  for (const entry of ready) {
    await options.recordAssistantReply(
      formatBackgroundTaskNotification(entry.task),
      false,
    );
    if (typeof entry.runtime.markBackgroundTaskNotified === "function") {
      await entry.runtime.markBackgroundTaskNotified(entry.task.id);
    } else {
      await entry.runtime.updateBackgroundTask(entry.task.id, { notified: true });
    }
    delivered += 1;
  }

  return delivered;
}
