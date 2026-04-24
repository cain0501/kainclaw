import { describe, expect, it, vi } from "vitest";

import { ActivityTracker } from "./activityTracker";
import { getToolRunningLabel } from "./hostUi";

describe("ActivityTracker", () => {
  it("adds and finishes activities while capping live history", () => {
    const tracker = new ActivityTracker({
      createId: (() => {
        let count = 0;
        return () => `activity-${++count}`;
      })(),
    });

    for (let index = 0; index < 12; index += 1) {
      tracker.add("phase", `step-${index}`);
    }

    expect(tracker.liveActivities).toHaveLength(10);
    expect(tracker.liveActivities[0]?.id).toBe("activity-3");

    tracker.finish("activity-12", "done", "finished");

    expect(tracker.liveActivities.at(-1)).toMatchObject({
      id: "activity-12",
      status: "done",
      detail: "finished",
    });
  });

  it("resets and archives run state", () => {
    const tracker = new ActivityTracker({
      createId: (() => {
        let count = 0;
        return () => `activity-${++count}`;
      })(),
    });

    for (let index = 0; index < 9; index += 1) {
      tracker.add("phase", `step-${index}`);
    }

    tracker.archiveCurrentRun();

    expect(tracker.liveActivities).toEqual([]);
    expect(tracker.lastRunActivities).toHaveLength(8);
    expect(tracker.lastRunActivities[0]?.label).toBe("step-1");

    tracker.reset();

    expect(tracker.liveActivities).toEqual([]);
    expect(tracker.lastRunActivities).toEqual([]);
  });

  it("tracks tool lifecycle updates and worktree cache invalidation hooks", () => {
    const onChange = vi.fn();
    const onWorktreeToolSuccess = vi.fn();
    const tracker = new ActivityTracker({
      createId: () => "tool-activity",
      onChange,
      onWorktreeToolSuccess,
    });

    tracker.handleToolLifecycle({
      executionId: "exec-1",
      phase: "start",
      toolName: "read_file",
      input: { path: "README.md" },
    });

    expect(tracker.liveActivities).toHaveLength(1);
    expect(tracker.liveActivities[0]).toMatchObject({
      id: "tool-activity",
      kind: "tool",
      label: getToolRunningLabel("read file"),
    });
    expect(tracker.liveActivities[0]?.detail).toContain("README.md");

    tracker.handleToolLifecycle({
      executionId: "exec-1",
      phase: "finish",
      toolName: "EnterWorktree",
      outcome: "success",
      summary: "entered",
    });

    expect(tracker.liveActivities[0]).toMatchObject({
      id: "tool-activity",
      status: "done",
      detail: "entered",
    });
    expect(onWorktreeToolSuccess).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores unknown tool completions", () => {
    const onChange = vi.fn();
    const tracker = new ActivityTracker({ onChange });

    tracker.finishToolExecution("missing", "done", "ignored");

    expect(tracker.liveActivities).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
