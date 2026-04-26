import { describe, expect, it, vi } from "vitest";

import type {
  PromptExecutionResult,
  PromptRuntimeLike,
} from "./promptExecutionHost";
import { runPromptRequestWithAssembly } from "./promptRequestFactory";

describe("promptRequestFactory", () => {
  it("assembles prompt host bindings and runs the request with the assembled bindings", async () => {
    const promptExecution: PromptExecutionResult<PromptRuntimeLike> = {
      kind: "continue",
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo",
      runtime: {} as PromptRuntimeLike,
      tools: [],
      effectivePrompt: "fix tests",
    };
    const bindings = {
      entryBindings: {} as any,
      flowBindings: {} as any,
    };
    const assemblePromptHostBindingsImpl = vi.fn(() => bindings);
    const runPromptRequestWithHostImpl = vi.fn(async () => promptExecution);
    const hostAssembly = {
      shared: {} as any,
      callbacks: {} as any,
      entry: {} as any,
      flow: {} as any,
    };
    const assignCurrentSessionId = vi.fn();

    const result = await runPromptRequestWithAssembly({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: "session-1",
      sessionMessagesLength: 1,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: vi.fn(() => "workspace-hash"),
      logSession: vi.fn(),
      createSession: vi.fn(async () => undefined),
      setActiveSessionId: vi.fn(async () => undefined),
      ensureSession: vi.fn(async () => undefined),
      appendMessages: vi.fn(async () => undefined),
      assignCurrentSessionId,
      hostAssembly,
      assemblePromptHostBindingsImpl,
      runPromptRequestWithHostImpl,
    });

    expect(result).toBe(promptExecution);
    expect(assemblePromptHostBindingsImpl).toHaveBeenCalledWith(hostAssembly);
    expect(runPromptRequestWithHostImpl).toHaveBeenCalledWith({
      prompt: "fix tests",
      workspaceFolderPath: "E:\\repo",
      currentSessionId: "session-1",
      sessionMessagesLength: 1,
      isSessionPersistenceEnabled: true,
      getWorkspaceHash: expect.any(Function),
      logSession: expect.any(Function),
      createSession: expect.any(Function),
      setActiveSessionId: expect.any(Function),
      ensureSession: expect.any(Function),
      appendMessages: expect.any(Function),
      assignCurrentSessionId,
      bindings,
    });
  });
});
