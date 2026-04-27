import { describe, expect, it, vi } from "vitest";

import { pollElectronBackgroundTaskNotifications } from "./electronBackgroundTaskNotificationHost";
import type { BackgroundTaskRecord, ConversationTaskRuntime } from "./tasks/types";

function createTaskRuntime(
  backgroundTasks: BackgroundTaskRecord[],
): ConversationTaskRuntime {
  const tasks = backgroundTasks.map(task => ({ ...task }));

  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(),
    listBackgroundTasks: vi.fn(async () => tasks.map(task => ({ ...task }))),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    blockTask: vi.fn(),
    registerBackgroundTask: vi.fn(),
    getBackgroundTask: vi.fn(),
    updateBackgroundTask: vi.fn(async (taskId, updates) => {
      const task = tasks.find(entry => entry.id === taskId) ?? null;
      if (!task) {
        return null;
      }
      Object.assign(task, updates);
      return { ...task };
    }),
    appendBackgroundOutput: vi.fn(),
    markBackgroundTaskNotified: vi.fn(async taskId => {
      const task = tasks.find(entry => entry.id === taskId) ?? null;
      if (!task) {
        return null;
      }
      task.notified = true;
      return { ...task };
    }),
    waitForBackgroundTask: vi.fn(),
  } as unknown as ConversationTaskRuntime;
}

describe("electronBackgroundTaskNotificationHost", () => {
  it("polls multiple runtimes, deduplicates task ids, and marks delivered tasks notified", async () => {
    const runtimeA = createTaskRuntime([
      {
        id: "remote-verify-1",
        taskType: "remote_agent",
        status: "completed",
        description: "Hosted verification: HEAD~1..HEAD",
        command: "/ultraverify HEAD~1..HEAD",
        metadata: {
          remoteTaskType: "claude_cli_verification",
        },
        outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
        result: "VERDICT: PASS",
        output: "VERDICT: PASS",
        createdAt: 1,
        updatedAt: 3,
      },
    ]);
    const runtimeB = createTaskRuntime([
      {
        id: "remote-verify-1",
        taskType: "remote_agent",
        status: "completed",
        description: "Hosted verification: HEAD~1..HEAD",
        command: "/ultraverify HEAD~1..HEAD",
        metadata: {
          remoteTaskType: "claude_cli_verification",
        },
        outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
        result: "VERDICT: PASS",
        output: "VERDICT: PASS",
        createdAt: 1,
        updatedAt: 4,
      },
      {
        id: "remote-review-1",
        taskType: "remote_agent",
        status: "failed",
        description: "Hosted review: HEAD~1..HEAD",
        command: "/ultrareview HEAD~1..HEAD",
        metadata: {
          remoteTaskType: "claude_cli_review",
        },
        outputPath: "E:\\repo\\remote-reviews\\remote-review-1\\output.log",
        error: "Remote review failed.",
        output: "",
        createdAt: 1,
        updatedAt: 5,
      },
    ]);
    const recordAssistantReply = vi.fn(async () => undefined);

    const delivered = await pollElectronBackgroundTaskNotifications({
      getTaskRuntimes: async () => [runtimeA, runtimeB],
      recordAssistantReply,
    });

    expect(delivered).toBe(2);
    expect(recordAssistantReply).toHaveBeenCalledTimes(2);
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("VERDICT: PASS"),
      false,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("Hosted review failed"),
      false,
    );
  });
});
