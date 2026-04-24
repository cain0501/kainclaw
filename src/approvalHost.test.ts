import { describe, expect, it, vi } from "vitest";

import { ApprovalHost } from "./approvalHost";

describe("approvalHost", () => {
  it("queues and resolves file approvals with diff preview and activity updates", async () => {
    const showDiff = vi.fn(async () => undefined);
    const addActivity = vi.fn(() => "activity-1");
    const finishActivity = vi.fn();
    const postState = vi.fn();
    const host = new ApprovalHost({
      showDiff,
      addActivity,
      finishActivity,
      postState,
      createId: () => "approval-1",
    });

    const pending = host.requestFileApproval("E:\\repo", {
      kind: "write_file",
      path: "src/file.ts",
      workspaceRoot: "E:\\repo",
      summary: "write summary",
      diff: "diff output",
      originalContent: "",
      proposedContent: "next",
    });
    await Promise.resolve();

    expect(showDiff).toHaveBeenCalledWith(
      "E:\\repo",
      expect.objectContaining({ path: "src/file.ts" }),
    );
    expect(host.getPendingApproval()).toEqual({
      id: "approval-1",
      kind: "file",
      title: "Confirm file write",
      summary: "write summary",
      path: "src/file.ts",
      diff: "diff output",
    });

    host.resolvePendingApproval(true);
    await expect(pending).resolves.toBe(true);
    expect(postState).toHaveBeenCalledTimes(2);
    expect(finishActivity).toHaveBeenCalledWith(
      "activity-1",
      "done",
      "已批准",
    );
  });

  it("queues and resolves tool approvals", async () => {
    const host = new ApprovalHost({
      showDiff: async () => undefined,
      addActivity: () => "activity-2",
      finishActivity: vi.fn(),
      postState: vi.fn(),
      createId: () => "approval-2",
    });

    const pending = host.requestToolApproval({
      kind: "tool_action",
      toolName: "RunCommandInBackground",
      title: "Run command",
      summary: "run it",
      inputPreview: "npm run build",
    });

    expect(host.hasPendingApproval()).toBe(true);
    expect(host.getPendingApproval()).toEqual({
      id: "approval-2",
      kind: "tool",
      title: "Run command",
      summary: "run it",
      inputPreview: "npm run build",
    });

    host.resolvePendingApproval(false);
    await expect(pending).resolves.toBe(false);
    expect(host.hasPendingApproval()).toBe(false);
  });

  it("rejects a second queued approval while one is pending", async () => {
    const host = new ApprovalHost({
      showDiff: async () => undefined,
      addActivity: () => "activity-3",
      finishActivity: vi.fn(),
      postState: vi.fn(),
    });

    const first = host.requestToolApproval({
      kind: "tool_action",
      toolName: "ToolA",
      title: "First",
      summary: "first",
      inputPreview: "input-a",
    });

    await expect(
      host.requestToolApproval({
        kind: "tool_action",
        toolName: "ToolB",
        title: "Second",
        summary: "second",
        inputPreview: "input-b",
      }),
    ).rejects.toThrow("Another confirmation is already pending.");

    host.resolvePendingApproval(true);
    await expect(first).resolves.toBe(true);
  });
});
