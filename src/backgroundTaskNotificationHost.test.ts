import { describe, expect, it, vi } from "vitest";

import {
  createBackgroundTaskNotificationBindings,
  formatBackgroundTaskNotification,
  shouldNotifyBackgroundTask,
} from "./backgroundTaskNotificationHost";
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

describe("backgroundTaskNotificationHost", () => {
  it("filters only unnotified terminal non-built-in background tasks", () => {
    expect(
      shouldNotifyBackgroundTask({
        id: "cmd-1",
        taskType: "local_bash",
        status: "completed",
        description: "build",
        output: "",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toBe(true);

    expect(
      shouldNotifyBackgroundTask({
        id: "verify-1",
        taskType: "built_in_agent",
        status: "failed",
        description: "verification",
        output: "",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toBe(false);

    expect(
      shouldNotifyBackgroundTask({
        id: "cmd-2",
        taskType: "local_bash",
        status: "completed",
        description: "build",
        output: "",
        notified: true,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toBe(false);
  });

  it("formats local and remote background task notifications", () => {
    expect(
      formatBackgroundTaskNotification({
        id: "cmd-1",
        taskType: "local_bash",
        status: "completed",
        description: "Background command: npm run build",
        command: "npm run build",
        outputPath: "E:\\repo\\background-commands\\cmd-1\\output.log",
        result: "Build completed successfully.",
        output: "",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toContain("Output file: E:\\repo\\background-commands\\cmd-1\\output.log");

    expect(
      formatBackgroundTaskNotification({
        id: "remote-1",
        taskType: "remote_agent",
        status: "failed",
        description: "remote review task",
        command: "Review PR #42 remotely",
        metadata: {
          sessionUrl: "https://claude.ai/code/sessions/sess-123",
        },
        error: "Remote review did not produce output.",
        output: "",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toContain("Remote session: https://claude.ai/code/sessions/sess-123");

    const hostedReviewNotification = formatBackgroundTaskNotification({
      id: "remote-review-1",
      taskType: "remote_agent",
      status: "completed",
      description: "Hosted review: HEAD~2..HEAD",
      command: "/ultrareview HEAD~2..HEAD",
      metadata: {
        remoteTaskType: "claude_cli_review",
      },
      outputPath: "E:\\repo\\remote-reviews\\remote-review-1\\output.log",
      result: "### Findings\n- issue 1\n- issue 2",
      output: "### Findings\n- issue 1\n- issue 2",
      createdAt: 1,
      updatedAt: 3,
    });

    expect(hostedReviewNotification).toContain("Hosted review completed");
    expect(hostedReviewNotification).toContain("### Findings");
    expect(hostedReviewNotification).toContain("- issue 2");

    const hostedVerificationNotification = formatBackgroundTaskNotification({
      id: "remote-verify-1",
      taskType: "remote_agent",
      status: "failed",
      description: "Hosted verification: HEAD~2..HEAD",
      command: "/ultraverify HEAD~2..HEAD",
      metadata: {
        remoteTaskType: "claude_cli_verification",
      },
      outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
      result: "### Check: build\nResult: FAIL\nVERDICT: FAIL",
      error: "Remote verification finished with VERDICT: FAIL.",
      output: "### Check: build\nResult: FAIL\nVERDICT: FAIL",
      createdAt: 1,
      updatedAt: 4,
    });

    expect(hostedVerificationNotification).toContain("Hosted verification finished with issues");
    expect(hostedVerificationNotification).toContain("VERDICT: FAIL");
  });

  it("delivers notifications once and marks tasks as notified", async () => {
    const runtime = createTaskRuntime([
      {
        id: "cmd-1",
        taskType: "local_bash",
        status: "completed",
        description: "Background command: npm run build",
        command: "npm run build",
        outputPath: "E:\\repo\\background-commands\\cmd-1\\output.log",
        result: "Build completed successfully.",
        output: "",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "verify-1",
        taskType: "built_in_agent",
        status: "completed",
        description: "Verification agent",
        output: "",
        createdAt: 1,
        updatedAt: 3,
      },
      {
        id: "remote-1",
        taskType: "remote_agent",
        status: "completed",
        description: "Hosted review: HEAD~2..HEAD",
        command: "/ultrareview HEAD~2..HEAD",
        metadata: {
          remoteTaskType: "claude_cli_review",
        },
        outputPath: "E:\\repo\\remote-reviews\\remote-1\\output.log",
        result: "### Findings\n- race condition",
        output: "### Findings\n- race condition",
        createdAt: 1,
        updatedAt: 4,
      },
      {
        id: "remote-verify-1",
        taskType: "remote_agent",
        status: "completed",
        description: "Hosted verification: HEAD~2..HEAD",
        command: "/ultraverify HEAD~2..HEAD",
        metadata: {
          remoteTaskType: "claude_cli_verification",
        },
        outputPath: "E:\\repo\\remote-verifications\\remote-verify-1\\output.log",
        result: "### Check: build\nVERDICT: PASS",
        output: "### Check: build\nVERDICT: PASS",
        createdAt: 1,
        updatedAt: 5,
      },
    ]);
    const recordAssistantReply = vi.fn(async () => undefined);

    const bindings = createBackgroundTaskNotificationBindings({
      getTaskRuntime: () => runtime,
      recordAssistantReply,
    });

    expect(await bindings.pollBackgroundTaskNotifications()).toBe(3);
    expect(recordAssistantReply).toHaveBeenCalledTimes(3);
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("Background task completed"),
      false,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("### Findings"),
      false,
    );
    expect(recordAssistantReply).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("VERDICT: PASS"),
      false,
    );

    recordAssistantReply.mockClear();
    expect(await bindings.pollBackgroundTaskNotifications()).toBe(0);
    expect(recordAssistantReply).not.toHaveBeenCalled();
  });
});
