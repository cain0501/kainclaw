import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensurePlanFileMock, readPlanFileMock } = vi.hoisted(() => ({
  ensurePlanFileMock: vi.fn(),
  readPlanFileMock: vi.fn(),
}));

vi.mock("./planMode/planMode", async importOriginal => {
  const actual = await importOriginal<typeof import("./planMode/planMode")>();
  return {
    ...actual,
    ensurePlanFile: ensurePlanFileMock,
    readPlanFile: readPlanFileMock,
  };
});

import {
  enterPlanModeWithHost,
  exitPlanModeWithHost,
  getPlanContentForWorkspace,
  resetPlanModeState,
} from "./planModeHost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planModeHost", () => {
  it("enters plan mode through host callbacks", async () => {
    ensurePlanFileMock.mockResolvedValue({
      absolutePath: "E:\\claudecodejingiang\\vscode-extension\\.cain-artifacts\\plans\\conv-1.md",
      relativePath: ".cain-artifacts/plans/conv-1.md",
      created: false,
      content: "# plan",
    });

    const states: unknown[] = [];
    const clearSwarm = vi.fn();
    const clearPendingPlanVerification = vi.fn();
    const postState = vi.fn();

    const result = await enterPlanModeWithHost({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      conversationKey: "conv-1",
      clearSwarm,
      clearPendingPlanVerification,
      setPlanModeState: state => {
        states.push(state);
      },
      postState,
    });

    expect(result).toEqual({
      planFilePath: ".cain-artifacts/plans/conv-1.md",
      planContent: "# plan",
    });
    expect(clearSwarm).toHaveBeenCalledTimes(1);
    expect(clearPendingPlanVerification).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      {
        active: true,
        planFilePath: ".cain-artifacts/plans/conv-1.md",
        conversationKey: "conv-1",
      },
    ]);
    expect(postState).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no active plan file", async () => {
    const result = await getPlanContentForWorkspace({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planModeState: { active: false },
    });

    expect(result).toBeNull();
    expect(readPlanFileMock).not.toHaveBeenCalled();
  });

  it("reads the current plan file when plan mode tracks one", async () => {
    readPlanFileMock.mockResolvedValue("# existing plan");

    const result = await getPlanContentForWorkspace({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planModeState: {
        active: true,
        planFilePath: ".cain-artifacts/plans/conv-1.md",
      },
    });

    expect(result).toBe("# existing plan");
    expect(readPlanFileMock).toHaveBeenCalledWith(
      "E:\\claudecodejingiang\\vscode-extension",
      ".cain-artifacts/plans/conv-1.md",
    );
  });

  it("throws when exiting plan mode without an active plan file", async () => {
    await expect(
      exitPlanModeWithHost({
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        planModeState: { active: true },
        sessionMessages: [],
        setPlanModeState: vi.fn(),
        setPendingPlanVerification: vi.fn(),
        postState: vi.fn(),
      }),
    ).rejects.toThrow("No active plan file found.");
  });

  it("throws when the tracked plan file is empty", async () => {
    readPlanFileMock.mockResolvedValue("   ");

    await expect(
      exitPlanModeWithHost({
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        planModeState: {
          active: true,
          planFilePath: ".cain-artifacts/plans/conv-1.md",
          conversationKey: "conv-1",
        },
        sessionMessages: [{ role: "user", content: "Implement plan mode" }],
        setPlanModeState: vi.fn(),
        setPendingPlanVerification: vi.fn(),
        postState: vi.fn(),
      }),
    ).rejects.toThrow(
      "No plan content found in .cain-artifacts/plans/conv-1.md.",
    );
  });

  it("exits plan mode and seeds pending verification state", async () => {
    readPlanFileMock.mockResolvedValue("# approved plan");

    const states: unknown[] = [];
    const pendingStates: unknown[] = [];
    const postState = vi.fn();

    const result = await exitPlanModeWithHost({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planModeState: {
        active: true,
        planFilePath: ".cain-artifacts/plans/conv-1.md",
        conversationKey: "conv-1",
      },
      sessionMessages: [{ role: "user", content: "Implement plan mode" }],
      setPlanModeState: state => {
        states.push(state);
      },
      setPendingPlanVerification: state => {
        pendingStates.push(state);
      },
      postState,
    });

    expect(result).toEqual({
      planFilePath: ".cain-artifacts/plans/conv-1.md",
      planContent: "# approved plan",
    });
    expect(states).toEqual([
      {
        active: false,
        planFilePath: ".cain-artifacts/plans/conv-1.md",
        conversationKey: "conv-1",
      },
    ]);
    expect(pendingStates).toEqual([
      {
        planFilePath: ".cain-artifacts/plans/conv-1.md",
        planContent: "# approved plan",
        approvedAtUserTurnCount: 1,
        verificationStarted: false,
        verificationCompleted: false,
      },
    ]);
    expect(postState).toHaveBeenCalledTimes(1);
  });

  it("resets plan mode back to the inactive state", () => {
    expect(resetPlanModeState()).toEqual({ active: false });
  });
});
