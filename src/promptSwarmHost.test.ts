import { describe, expect, it, vi } from "vitest";

import { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import {
  createPromptTurnSwarm,
  createPromptTurnSwarmFactory,
  ensurePromptTurnSwarm,
} from "./promptSwarmHost";

describe("promptSwarmHost", () => {
  it("returns undefined when swarm is disabled for the turn", () => {
    const createSwarm = vi.fn();
    const assignSwarm = vi.fn();

    const swarm = ensurePromptTurnSwarm({
      swarmEnabledForTurn: false,
      createSwarm: createSwarm as any,
      assignSwarm,
    });

    expect(swarm).toBeUndefined();
    expect(createSwarm).not.toHaveBeenCalled();
    expect(assignSwarm).not.toHaveBeenCalled();
  });

  it("reuses an existing swarm without reassigning it", () => {
    const existingSwarm = { id: "existing" } as any;
    const assignSwarm = vi.fn();

    const swarm = ensurePromptTurnSwarm({
      swarmEnabledForTurn: true,
      existingSwarm,
      createSwarm: vi.fn() as any,
      assignSwarm,
    });

    expect(swarm).toBe(existingSwarm);
    expect(assignSwarm).not.toHaveBeenCalled();
  });

  it("creates and assigns a swarm when enabled and absent", () => {
    const createdSwarm = { id: "created" } as any;
    const createSwarm = vi.fn(() => createdSwarm);
    const assignSwarm = vi.fn();

    const swarm = ensurePromptTurnSwarm({
      swarmEnabledForTurn: true,
      createSwarm: createSwarm as any,
      assignSwarm,
    });

    expect(swarm).toBe(createdSwarm);
    expect(createSwarm).toHaveBeenCalledTimes(1);
    expect(assignSwarm).toHaveBeenCalledWith(createdSwarm);
  });

  it("builds a prompt-turn swarm that resolves worker providers through host adapters", async () => {
    const provider = { runStep: vi.fn() };
    const resolveWorkerProviderConfig = vi.fn(async () => ({
      type: "anthropic" as const,
      apiKey: "secret",
      model: "claude-sonnet",
    }));
    const createProviderRuntimeOptions = vi.fn(() => ({ fastMode: true }));
    const getEffectiveWorkspaceRoot = vi.fn(() => "E:\\repo");
    const buildProviderAdapter = vi.fn(() => provider as any);
    const postWorkerUpdate = vi.fn();
    const backgroundTasks = {
      registerBackgroundTask: vi.fn(),
      updateBackgroundTask: vi.fn(),
      getBackgroundTask: vi.fn(),
      listBackgroundTasks: vi.fn(),
    } as any;

    const swarm = createPromptTurnSwarm({
      workspaceFolderPath: "E:\\repo",
      workerToolContext: {
        workspaceRoot: "E:\\repo",
        invokerKind: "worker",
      } as any,
      backgroundTasks,
      resolveWorkerProviderConfig,
      createProviderRuntimeOptions,
      getEffectiveWorkspaceRoot,
      buildProviderAdapter,
      postWorkerUpdate,
    });

    expect(swarm).toBeInstanceOf(SwarmCoordinator);

    const resolvedProvider = await (swarm as any).opts.resolveWorkerProvider(
      "worker-alias",
      "worker system prompt",
    );
    (swarm as any).opts.onWorkerUpdate({ id: "worker-1", status: "running" });

    expect(resolveWorkerProviderConfig).toHaveBeenCalledWith("worker-alias");
    expect(createProviderRuntimeOptions).toHaveBeenCalledWith({
      type: "anthropic",
      apiKey: "secret",
      model: "claude-sonnet",
    });
    expect(getEffectiveWorkspaceRoot).toHaveBeenCalledWith("E:\\repo");
    expect(buildProviderAdapter).toHaveBeenCalledWith({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "worker system prompt",
      envMap: {},
      runtimeOptions: { fastMode: true, requestKind: "swarm-worker" },
    });
    expect(postWorkerUpdate).toHaveBeenCalledWith({
      id: "worker-1",
      status: "running",
    });
    expect(resolvedProvider).toBe(provider);
  });

  it("creates a prompt-turn swarm factory that only needs worker tool context at call time", () => {
    const factory = createPromptTurnSwarmFactory({
      workspaceFolderPath: "E:\\repo",
      backgroundTasks: {
        registerBackgroundTask: vi.fn(),
        updateBackgroundTask: vi.fn(),
        getBackgroundTask: vi.fn(),
        listBackgroundTasks: vi.fn(),
      } as any,
      resolveWorkerProviderConfig: vi.fn(async () => ({
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      })),
      createProviderRuntimeOptions: vi.fn(() => ({})),
      getEffectiveWorkspaceRoot: vi.fn(() => "E:\\repo"),
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() }) as any),
      postWorkerUpdate: vi.fn(),
    });

    const swarm = factory({
      workerToolContext: {
        workspaceRoot: "E:\\repo",
        invokerKind: "worker",
      } as any,
    });

    expect(swarm).toBeInstanceOf(SwarmCoordinator);
    expect((swarm as any).opts.workerToolContext).toEqual({
      workspaceRoot: "E:\\repo",
      invokerKind: "worker",
    });
  });
});
