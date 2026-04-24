import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../toolRuntime";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "../providers/IProviderAdapter";
import { SwarmCoordinator } from "./SwarmCoordinator";

class ScriptedProvider implements IProviderAdapter {
  constructor(private readonly steps: NormalizedStep[]) {}

  async runStep(): Promise<NormalizedStep> {
    const next = this.steps.shift();
    if (!next) {
      throw new Error("No scripted step available");
    }
    return next;
  }
}

class PendingProvider implements IProviderAdapter {
  async runStep(): Promise<NormalizedStep> {
    return await new Promise<NormalizedStep>(() => {
      // Intentionally never resolves; used to keep workers in a running state.
    });
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for swarm state to settle.");
}

function createCoordinator(options?: {
  resolveWorkerProvider?: (alias: string, systemPrompt: string) => Promise<IProviderAdapter>;
  backgroundTasks?: {
    registerBackgroundTask: (task: any) => Promise<any>;
    updateBackgroundTask: (taskId: string, updates: any) => Promise<any>;
  };
}) {
  const updates: unknown[] = [];
  const workerToolContext: ToolContext = {
    workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
  };

  const coordinator = new SwarmCoordinator({
    resolveWorkerProvider:
      options?.resolveWorkerProvider ??
      (async () => {
        throw new Error("not needed for these tests");
      }),
    onWorkerUpdate: patch => {
      updates.push(patch);
    },
    workerToolContext,
    backgroundTasks: options?.backgroundTasks as any,
  });

  return { coordinator, updates };
}

describe("SwarmCoordinator public surface", () => {
  it("exposes the three swarm tool definitions", () => {
    const { coordinator } = createCoordinator();
    const names = coordinator.getSwarmToolDefinitions().map(tool => tool.name);

    expect(names).toEqual(["spawn_agent", "send_message", "wait_for_agents"]);
  });

  it("send_message posts to the coordinator inbox", async () => {
    const { coordinator } = createCoordinator();

    const result = await coordinator.executeSwarmTool("send_message", {
      to: "coordinator",
      content: "hello from test",
    });

    expect(result.summary).toContain("消息已发送给 coordinator");
    expect(coordinator.drainCoordinatorInbox()).toContain("hello from test");
  });

  it("wait_for_agents reports not_found for unknown workers and drains inbox messages", async () => {
    const { coordinator } = createCoordinator();
    await coordinator.executeSwarmTool("send_message", {
      to: "coordinator",
      content: "status update",
    });

    const result = await coordinator.executeSwarmTool("wait_for_agents", {
      ids: "worker-9",
      timeoutMs: 1,
    });

    expect(result.summary).toContain("worker-9(not_found)");
    expect(result.content).toContain('"status":"not_found"');
    expect(result.content).toContain("status update");
  });

  it("spawn_agent registers a worker and bridges background task updates", async () => {
    const registered: any[] = [];
    const updated: Array<{ taskId: string; updates: any }> = [];
    const { coordinator, updates } = createCoordinator({
      resolveWorkerProvider: async () =>
        new ScriptedProvider([
          {
            text: "worker finished",
            toolCalls: [],
            done: true,
          },
        ]),
      backgroundTasks: {
        registerBackgroundTask: async task => {
          registered.push(task);
          return task;
        },
        updateBackgroundTask: async (taskId, patch) => {
          updated.push({ taskId, updates: patch });
          return null;
        },
      },
    });

    const result = await coordinator.executeSwarmTool("spawn_agent", {
      name: "Worker One",
      task: "Inspect the diff",
      providerAlias: "default",
      maxTurns: 1,
    });

    expect(result.summary).toContain('Worker "Worker One" (worker-0) spawned');
    expect(registered[0]).toMatchObject({
      id: "worker-0",
      taskType: "local_agent",
      status: "pending",
      description: "Worker One",
      command: "Inspect the diff",
    });

    await waitFor(() =>
      updates.some(
        entry =>
          (entry as any).id === "worker-0" && (entry as any).status === "done",
      ),
    );

    expect(updated.some(entry => entry.updates.status === "completed")).toBe(true);
    expect(coordinator.drainCoordinatorInbox()).toContain("[Worker One 完成] worker finished");
  });

  it("rejects unknown swarm tools", async () => {
    const { coordinator } = createCoordinator();

    await expect(
      coordinator.executeSwarmTool("unknown_tool", {}),
    ).rejects.toThrow(/Unknown swarm tool/);
  });

  it("enforces the maximum worker count", async () => {
    const { coordinator } = createCoordinator({
      resolveWorkerProvider: async () => new PendingProvider(),
    });

    for (let index = 0; index < 5; index += 1) {
      await coordinator.executeSwarmTool("spawn_agent", {
        name: `Worker ${index + 1}`,
        task: `Task ${index + 1}`,
        providerAlias: "default",
        maxTurns: 1,
      });
    }

    await expect(
      coordinator.executeSwarmTool("spawn_agent", {
        name: "Worker 6",
        task: "Overflow",
        providerAlias: "default",
      }),
    ).rejects.toThrow(/Maximum worker count reached/);

    coordinator.dispose();
  });

  it("stopWorker cancels a running worker and updates the background task", async () => {
    const updates: Array<{ taskId: string; updates: any }> = [];
    const { coordinator } = createCoordinator({
      resolveWorkerProvider: async () => new PendingProvider(),
      backgroundTasks: {
        registerBackgroundTask: async task => task,
        updateBackgroundTask: async (taskId, patch) => {
          updates.push({ taskId, updates: patch });
          return null;
        },
      },
    });

    await coordinator.executeSwarmTool("spawn_agent", {
      name: "Worker One",
      task: "Long task",
      providerAlias: "default",
      maxTurns: 1,
    });

    await waitFor(() =>
      coordinator.getWorkers().some(worker => worker.id === "worker-0" && worker.status === "running"),
    );

    const result = await coordinator.stopWorker("worker-0");

    expect(result).toEqual({
      taskId: "worker-0",
      taskType: "local_agent",
      command: "Long task",
    });
    expect(updates.some(entry => entry.taskId === "worker-0" && entry.updates.status === "cancelled")).toBe(true);
  });

  it("dispose cancels active workers and propagates cancellation to background tasks", async () => {
    const updates: Array<{ taskId: string; updates: any }> = [];
    const { coordinator } = createCoordinator({
      resolveWorkerProvider: async () => new PendingProvider(),
      backgroundTasks: {
        registerBackgroundTask: async task => task,
        updateBackgroundTask: async (taskId, patch) => {
          updates.push({ taskId, updates: patch });
          return null;
        },
      },
    });

    await coordinator.executeSwarmTool("spawn_agent", {
      name: "Worker One",
      task: "Long task",
      providerAlias: "default",
      maxTurns: 1,
    });

    await waitFor(() => coordinator.getWorkers().some(worker => worker.id === "worker-0"));
    coordinator.dispose();

    expect(updates.some(entry => entry.taskId === "worker-0" && entry.updates.status === "cancelled")).toBe(true);
  });
});
