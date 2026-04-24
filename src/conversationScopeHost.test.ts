import { describe, expect, it, vi } from "vitest";

import {
  createConversationScopeBindings,
  ensureConversationWorktreeHydrated,
  findActiveBuiltInAgentTask,
  getConversationTaskRuntime,
  getConversationWorktreeRuntime,
  getEffectiveWorkspaceRoot,
} from "./conversationScopeHost";

describe("conversationScopeHost", () => {
  it("resolves conversation-scoped task and worktree runtimes", async () => {
    const taskRuntime = { listBackgroundTasks: vi.fn(async () => []) } as any;
    const worktreeRuntime = {
      getEffectiveWorkspaceRoot: vi.fn(() => "E:\\repo\\.claude\\worktrees\\wt-1"),
    } as any;

    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => taskRuntime),
    };
    const worktreeRuntimeStore = {
      getConversationRuntime: vi.fn(() => worktreeRuntime),
      hydrateConversation: vi.fn(async () => undefined),
    };

    expect(
      getConversationTaskRuntime({
        taskRuntimeStore,
        workspaceRoot: "E:\\repo",
        conversationKey: "session-1",
      }),
    ).toBe(taskRuntime);
    expect(
      getConversationWorktreeRuntime({
        worktreeRuntimeStore,
        workspaceRoot: "E:\\repo",
        conversationKey: "session-1",
      }),
    ).toBe(worktreeRuntime);

    await ensureConversationWorktreeHydrated({
      worktreeRuntimeStore,
      workspaceRoot: "E:\\repo",
      conversationKey: "session-1",
    });
    expect(worktreeRuntimeStore.hydrateConversation).toHaveBeenCalledWith(
      "E:\\repo",
      "session-1",
    );

    expect(
      getEffectiveWorkspaceRoot({
        worktreeRuntimeStore,
        workspaceRoot: "E:\\repo",
        conversationKey: "session-1",
      }),
    ).toBe("E:\\repo\\.claude\\worktrees\\wt-1");
  });

  it("finds only pending or running built-in agent tasks for the requested agent type", async () => {
    const listBackgroundTasks = vi.fn(async () => [
      {
        id: "review-1",
        taskType: "built_in_agent",
        agentType: "review",
        status: "completed",
      },
      {
        id: "verify-1",
        taskType: "built_in_agent",
        agentType: "verification",
        status: "running",
      },
      {
        id: "verify-2",
        taskType: "local_agent",
        agentType: "verification",
        status: "running",
      },
    ]);
    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => ({ listBackgroundTasks }) as any),
    };

    const task = await findActiveBuiltInAgentTask({
      taskRuntimeStore,
      workspaceRoot: "E:\\repo",
      conversationKey: "session-1",
      agentType: "verification",
    });

    expect(task).toMatchObject({
      id: "verify-1",
      taskType: "built_in_agent",
      agentType: "verification",
      status: "running",
    });
  });

  it("treats same agentType + same diffRef as duplicate", async () => {
    const listBackgroundTasks = vi.fn(async () => [
      {
        id: "review-diffref-1",
        taskType: "built_in_agent",
        agentType: "review",
        status: "running",
        metadata: { diffRef: "main...HEAD" },
      },
    ]);
    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => ({ listBackgroundTasks }) as any),
    };

    const found = await findActiveBuiltInAgentTask({
      taskRuntimeStore,
      workspaceRoot: "E:\\repo",
      conversationKey: "session-1",
      agentType: "review",
      diffRef: "main...HEAD",
    });

    expect(found).toMatchObject({ id: "review-diffref-1" });
  });

  it("allows same agentType with different diffRef to run concurrently", async () => {
    const listBackgroundTasks = vi.fn(async () => [
      {
        id: "review-diffref-2",
        taskType: "built_in_agent",
        agentType: "review",
        status: "running",
        metadata: { diffRef: "main...HEAD" },
      },
    ]);
    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => ({ listBackgroundTasks }) as any),
    };

    const found = await findActiveBuiltInAgentTask({
      taskRuntimeStore,
      workspaceRoot: "E:\\repo",
      conversationKey: "session-1",
      agentType: "review",
      diffRef: "HEAD~1..HEAD",
    });

    expect(found).toBeUndefined();
  });

  it("treats same agentType with no diffRef as duplicate (backward compat)", async () => {
    const listBackgroundTasks = vi.fn(async () => [
      {
        id: "verify-nodiff",
        taskType: "built_in_agent",
        agentType: "verification",
        status: "running",
        metadata: { originalTask: "Fix the bug" },
      },
    ]);
    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => ({ listBackgroundTasks }) as any),
    };

    const found = await findActiveBuiltInAgentTask({
      taskRuntimeStore,
      workspaceRoot: "E:\\repo",
      conversationKey: "session-1",
      agentType: "verification",
    });

    expect(found).toMatchObject({ id: "verify-nodiff" });
  });

  it("creates live conversation-scope bindings from stores plus a conversation-key getter", async () => {
    let conversationKey = "session-1";
    const taskRuntime = { listBackgroundTasks: vi.fn(async () => []) } as any;
    const worktreeRuntime = {
      getEffectiveWorkspaceRoot: vi.fn(() => "E:\\repo\\.claude\\worktrees\\wt-1"),
    } as any;
    const taskRuntimeStore = {
      getConversationRuntime: vi.fn(() => taskRuntime),
    };
    const worktreeRuntimeStore = {
      getConversationRuntime: vi.fn(() => worktreeRuntime),
      hydrateConversation: vi.fn(async () => undefined),
    };

    const bindings = createConversationScopeBindings({
      taskRuntimeStore,
      worktreeRuntimeStore,
      getConversationKey: () => conversationKey,
    });

    expect(bindings.getConversationTaskRuntime("E:\\repo")).toBe(taskRuntime);
    expect(bindings.getConversationWorktreeRuntime("E:\\repo")).toBe(worktreeRuntime);
    await bindings.ensureConversationWorktreeHydrated("E:\\repo");
    expect(bindings.getEffectiveWorkspaceRoot("E:\\repo")).toBe(
      "E:\\repo\\.claude\\worktrees\\wt-1",
    );

    conversationKey = "session-2";
    await bindings.findActiveBuiltInAgentTask("E:\\repo", "review", "main...HEAD");

    expect(taskRuntimeStore.getConversationRuntime).toHaveBeenNthCalledWith(
      1,
      "E:\\repo",
      "session-1",
    );
    expect(taskRuntimeStore.getConversationRuntime).toHaveBeenNthCalledWith(
      2,
      "E:\\repo",
      "session-2",
    );
    expect(worktreeRuntimeStore.hydrateConversation).toHaveBeenCalledWith(
      "E:\\repo",
      "session-1",
    );
  });
});
