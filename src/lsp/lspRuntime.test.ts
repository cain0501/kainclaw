import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeCommand,
  openTextDocument,
  getDiagnostics,
  textDocuments,
  execFile,
  stat,
} = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  openTextDocument: vi.fn(),
  getDiagnostics: vi.fn(),
  textDocuments: [] as Array<{ uri: { fsPath: string } }>,
  execFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("vscode", () => {
  class Position {
    line: number;
    character: number;

    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  }

  return {
    Position,
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
    },
    workspace: {
      openTextDocument,
      textDocuments,
    },
    commands: {
      executeCommand,
    },
    languages: {
      getDiagnostics,
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    SymbolKind: {
      12: "Function",
      Function: 12,
    },
  };
});

vi.mock("node:child_process", () => ({ execFile }));
vi.mock("node:fs/promises", () => ({ stat }));

import {
  LSP_EMPTY_RESULT_RETRY_DELAY_MS,
  assertPositiveInteger,
  getGitIgnoredPaths,
  resolveWorkspacePath,
  toPosition,
  VsCodeLspRuntime,
} from "./lspRuntime";

describe("lsp runtime helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    textDocuments.length = 0;
    openTextDocument.mockImplementation(async uri => {
      textDocuments.push({ uri });
      return { uri };
    });
    stat.mockResolvedValue({
      isFile: () => true,
      size: 0,
    });
    // Default: git check-ignore exits with code 1 (no paths ignored → no filtering)
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        cb(Object.assign(new Error(""), { code: 1 }));
      },
    );
  });

  it("resolves workspace-relative paths and rejects escaping paths", () => {
    const workspaceRoot = "E:\\claudecodejingiang\\vscode-extension";

    expect(resolveWorkspacePath(workspaceRoot, "src\\lsp\\types.ts")).toContain(
      "src\\lsp\\types.ts",
    );

    expect(() => resolveWorkspacePath(workspaceRoot, "..\\outside.ts")).toThrow(
      /Path escapes the workspace/,
    );
  });

  it("accepts only positive 1-based integers", () => {
    expect(assertPositiveInteger(3, "line")).toBe(3);
    expect(() => assertPositiveInteger(0, "line")).toThrow(/line must be a positive 1-based integer/);
    expect(() => assertPositiveInteger(1.5, "character")).toThrow(
      /character must be a positive 1-based integer/,
    );
  });

  it("converts 1-based positions to VS Code positions", () => {
    const position = toPosition(5, 9);

    expect(position).toEqual({
      line: 4,
      character: 8,
    });
  });

  it("fails early when a file-backed operation omits filePath", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");

    await expect(
      runtime.query({
        operation: "goToDefinition",
        line: 5,
        character: 9,
      }),
    ).rejects.toThrow(/filePath is required for goToDefinition/);

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("fails before opening VS Code documents when the target file is missing", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    stat.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));

    await expect(
      runtime.query({
        operation: "goToDefinition",
        filePath: "src/lsp/missing.ts",
        line: 5,
        character: 9,
      }),
    ).rejects.toThrow(/File does not exist: src\/lsp\/missing.ts/);

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("fails before opening VS Code documents when the target path is not a file", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    stat.mockResolvedValueOnce({
      isFile: () => false,
      size: 0,
    });

    await expect(
      runtime.query({
        operation: "hover",
        filePath: "src/lsp",
        line: 5,
        character: 9,
      }),
    ).rejects.toThrow(/Path is not a file: src\/lsp/);

    expect(openTextDocument).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("returns a bounded result before opening VS Code documents for oversized files", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    stat.mockResolvedValueOnce({
      isFile: () => true,
      size: 10_000_001,
    });

    const result = await runtime.query({
      operation: "documentSymbols",
      filePath: "src/lsp/huge.ts",
    });

    expect(result.summary).toBe("LSP file too large for analysis");
    expect(result.content).toContain("exceeds 10MB limit");
    expect(openTextDocument).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("filters and limits document diagnostics", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    getDiagnostics.mockReturnValue([
      {
        severity: 1,
        code: "WARN1",
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 2 },
        },
        message: "first warning",
      },
      {
        severity: 1,
        code: "WARN2",
        range: {
          start: { line: 1, character: 3 },
          end: { line: 1, character: 4 },
        },
        message: "second warning",
      },
      {
        severity: 0,
        code: "ERR1",
        range: {
          start: { line: 2, character: 5 },
          end: { line: 2, character: 6 },
        },
        message: "error detail",
      },
    ]);

    const result = await runtime.query({
      operation: "documentDiagnostics",
      filePath: "src/lsp/lspRuntime.ts",
      severity: "warning",
      maxResults: 1,
    });

    expect(openTextDocument).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain("returned 1 result");
    expect(result.content).toContain("Warning [WARN1]");
    expect(result.content).not.toContain("WARN2");
    expect(result.content).toContain("1 additional result(s) omitted by maxResults");
  });

  it("limits workspace symbol results", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    executeCommand.mockResolvedValueOnce([
      {
        name: "runAgent",
        kind: 12,
        location: {
          uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\agent\\agentRunner.ts" },
          range: {
            start: { line: 20, character: 8 },
            end: { line: 20, character: 16 },
          },
        },
      },
      {
        name: "runPromptAgentTurn",
        kind: 12,
        location: {
          uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\promptTurnHost.ts" },
          range: {
            start: { line: 30, character: 2 },
            end: { line: 30, character: 20 },
          },
        },
      },
    ]);

    const result = await runtime.query({
      operation: "workspaceSymbols",
      query: "run",
      maxResults: 1,
    });

    expect(executeCommand).toHaveBeenCalledWith("vscode.executeWorkspaceSymbolProvider", "run");
    expect(result.content).toContain("runAgent");
    expect(result.content).not.toContain("runPromptAgentTurn");
    expect(result.content).toContain("1 additional result(s) omitted by maxResults");
  });

  it("uses itemIndex to select a specific call hierarchy item", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    executeCommand
      .mockResolvedValueOnce([
        {
          name: "firstItem",
          kind: 12,
          uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\first.ts" },
          selectionRange: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: 4 },
          },
        },
        {
          name: "secondItem",
          kind: 12,
          uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\second.ts" },
          selectionRange: {
            start: { line: 5, character: 2 },
            end: { line: 5, character: 8 },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          from: {
            name: "caller",
            kind: 12,
            uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\caller.ts" },
            selectionRange: {
              start: { line: 10, character: 0 },
              end: { line: 10, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 10, character: 4 },
              end: { line: 10, character: 10 },
            },
          ],
        },
      ]);

    const result = await runtime.query({
      operation: "incomingCalls",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
      itemIndex: 2,
    });

    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      "vscode.prepareCallHierarchy",
      { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\lsp\\lspRuntime.ts" },
      { line: 4, character: 2 },
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      "vscode.provideIncomingCalls",
      expect.objectContaining({ name: "secondItem" }),
    );
    expect(result.content).toContain("caller");
  });

  it("retries once when a newly opened document returns an empty result", async () => {
    vi.useFakeTimers();

    try {
      const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
      executeCommand
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            uri: { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\agent\\agentRunner.ts" },
            range: {
              start: { line: 20, character: 8 },
              end: { line: 20, character: 16 },
            },
          },
        ]);

      const resultPromise = runtime.query({
        operation: "goToDefinition",
        filePath: "src/agent/agentRunner.ts",
        line: 10,
        character: 5,
      });

      await vi.advanceTimersByTimeAsync(LSP_EMPTY_RESULT_RETRY_DELAY_MS);
      const result = await resultPromise;

      expect(executeCommand).toHaveBeenCalledTimes(2);
      expect(result.content).toContain("Defined in src/agent/agentRunner.ts:21:9");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports provider unavailable when VS Code returns undefined after warmup", async () => {
    vi.useFakeTimers();

    try {
      const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
      executeCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const resultPromise = runtime.query({
        operation: "goToDefinition",
        filePath: "src/agent/agentRunner.ts",
        line: 10,
        character: 5,
      });

      await vi.advanceTimersByTimeAsync(LSP_EMPTY_RESULT_RETRY_DELAY_MS);
      const result = await resultPromise;

      expect(executeCommand).toHaveBeenCalledTimes(2);
      expect(result.summary).toBe("No LSP provider available");
      expect(result.content).toContain("No LSP provider available for file type: .ts");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports provider unavailable for workspace symbols when no provider answers", async () => {
    const runtime = new VsCodeLspRuntime(() => "E:\\claudecodejingiang\\vscode-extension");
    executeCommand.mockResolvedValueOnce(undefined);

    const result = await runtime.query({
      operation: "workspaceSymbols",
      query: "",
    });

    expect(executeCommand).toHaveBeenCalledWith("vscode.executeWorkspaceSymbolProvider", "");
    expect(result.summary).toBe("No LSP provider available");
    expect(result.content).toContain("operation: workspaceSymbols");
  });
});

describe("lsp gitignored filtering", () => {
  const workspaceRoot = "E:\\claudecodejingiang\\vscode-extension";

  function makeGitIgnoreMock(ignoredRelPaths: string[]) {
    const ignoredSet = new Set(ignoredRelPaths);
    execFile.mockImplementation(
      (
        _cmd: unknown,
        args: unknown,
        _opts: unknown,
        cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
      ) => {
        const argsList = args as string[];
        const pathArgs = argsList.slice(argsList.indexOf("--") + 1);
        const matched = pathArgs.filter(p => ignoredSet.has(p));
        if (matched.length > 0) {
          cb(null, { stdout: matched.join("\n") + "\n", stderr: "" });
        } else {
          cb(Object.assign(new Error(""), { code: 1 }));
        }
      },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    textDocuments.length = 0;
    openTextDocument.mockImplementation(async (uri: { fsPath: string }) => {
      textDocuments.push({ uri });
      return { uri };
    });
    stat.mockResolvedValue({
      isFile: () => true,
      size: 0,
    });
    // Default: exit code 1 (no paths ignored)
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        cb(Object.assign(new Error(""), { code: 1 }));
      },
    );
  });

  it("filters a gitignored location from goToDefinition results", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    makeGitIgnoreMock(["src/lsp/ignored.ts"]);
    executeCommand.mockResolvedValueOnce([
      {
        uri: { fsPath: `${workspaceRoot}\\src\\lsp\\ignored.ts` },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      },
      {
        uri: { fsPath: `${workspaceRoot}\\src\\lsp\\real.ts` },
        range: { start: { line: 10, character: 2 }, end: { line: 10, character: 8 } },
      },
    ]);

    const result = await runtime.query({
      operation: "goToDefinition",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
    });

    expect(result.content).toContain("real.ts");
    expect(result.content).not.toContain("ignored.ts");
  });

  it("filters gitignored call hierarchy items before applying itemIndex", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    makeGitIgnoreMock(["src/lsp/ignored.ts"]);
    executeCommand.mockResolvedValueOnce([
      {
        name: "ignoredItem",
        kind: 12,
        uri: { fsPath: `${workspaceRoot}\\src\\lsp\\ignored.ts` },
        selectionRange: {
          start: { line: 1, character: 1 },
          end: { line: 1, character: 8 },
        },
      },
      {
        name: "realItem",
        kind: 12,
        uri: { fsPath: `${workspaceRoot}\\src\\lsp\\real.ts` },
        selectionRange: {
          start: { line: 5, character: 2 },
          end: { line: 5, character: 8 },
        },
      },
    ]);

    const result = await runtime.query({
      operation: "prepareCallHierarchy",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
      itemIndex: 1,
    });

    expect(result.content).toContain("realItem");
    expect(result.content).not.toContain("ignoredItem");
  });

  it("filters gitignored incoming callers", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    makeGitIgnoreMock(["src/lsp/ignored-caller.ts"]);
    executeCommand
      .mockResolvedValueOnce([
        {
          name: "targetItem",
          kind: 12,
          uri: { fsPath: `${workspaceRoot}\\src\\lsp\\target.ts` },
          selectionRange: {
            start: { line: 2, character: 1 },
            end: { line: 2, character: 7 },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          from: {
            name: "ignoredCaller",
            kind: 12,
            uri: { fsPath: `${workspaceRoot}\\src\\lsp\\ignored-caller.ts` },
            selectionRange: {
              start: { line: 10, character: 0 },
              end: { line: 10, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 10, character: 4 },
              end: { line: 10, character: 10 },
            },
          ],
        },
        {
          from: {
            name: "realCaller",
            kind: 12,
            uri: { fsPath: `${workspaceRoot}\\src\\lsp\\real-caller.ts` },
            selectionRange: {
              start: { line: 20, character: 0 },
              end: { line: 20, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 20, character: 2 },
              end: { line: 20, character: 8 },
            },
          ],
        },
      ]);

    const result = await runtime.query({
      operation: "incomingCalls",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
    });

    expect(result.content).toContain("realCaller");
    expect(result.content).not.toContain("ignoredCaller");
  });

  it("filters gitignored outgoing callees before applying maxResults", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    makeGitIgnoreMock(["src/lsp/ignored-callee.ts"]);
    executeCommand
      .mockResolvedValueOnce([
        {
          name: "targetItem",
          kind: 12,
          uri: { fsPath: `${workspaceRoot}\\src\\lsp\\target.ts` },
          selectionRange: {
            start: { line: 2, character: 1 },
            end: { line: 2, character: 7 },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          to: {
            name: "ignoredCallee",
            kind: 12,
            uri: { fsPath: `${workspaceRoot}\\src\\lsp\\ignored-callee.ts` },
            selectionRange: {
              start: { line: 12, character: 0 },
              end: { line: 12, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 12, character: 1 },
              end: { line: 12, character: 5 },
            },
          ],
        },
        {
          to: {
            name: "realCallee",
            kind: 12,
            uri: { fsPath: `${workspaceRoot}\\src\\lsp\\real-callee.ts` },
            selectionRange: {
              start: { line: 30, character: 0 },
              end: { line: 30, character: 6 },
            },
          },
          fromRanges: [
            {
              start: { line: 30, character: 2 },
              end: { line: 30, character: 6 },
            },
          ],
        },
      ]);

    const result = await runtime.query({
      operation: "outgoingCalls",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
      maxResults: 1,
    });

    expect(result.content).toContain("realCallee");
    expect(result.content).not.toContain("ignoredCallee");
    expect(result.content).not.toContain("omitted by maxResults");
  });

  it("filters gitignored workspace symbols before applying maxResults", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    // ignored.ts is gitignored; with maxResults=1, filter must run first so the non-ignored
    // symbol wins the slot rather than the ignored one that appears first in the list
    makeGitIgnoreMock(["src/lsp/ignored.ts"]);
    executeCommand.mockResolvedValueOnce([
      {
        name: "ignoredFn",
        kind: 12,
        location: {
          uri: { fsPath: `${workspaceRoot}\\src\\lsp\\ignored.ts` },
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 8 } },
        },
      },
      {
        name: "realFn",
        kind: 12,
        location: {
          uri: { fsPath: `${workspaceRoot}\\src\\agent\\agentRunner.ts` },
          range: { start: { line: 20, character: 0 }, end: { line: 20, character: 6 } },
        },
      },
    ]);

    const result = await runtime.query({
      operation: "workspaceSymbols",
      query: "Fn",
      maxResults: 1,
    });

    expect(result.content).toContain("realFn");
    expect(result.content).not.toContain("ignoredFn");
    // Only 1 result after filtering; no hidden-count notice expected
    expect(result.content).not.toContain("omitted by maxResults");
  });

  it("filters malformed workspace symbols before applying maxResults", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    executeCommand.mockResolvedValueOnce([
      {
        name: "brokenFn",
        kind: 12,
        location: {
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 8 } },
        },
      },
      {
        name: "realFn",
        kind: 12,
        location: {
          uri: { fsPath: `${workspaceRoot}\\src\\agent\\agentRunner.ts` },
          range: { start: { line: 20, character: 0 }, end: { line: 20, character: 6 } },
        },
      },
    ]);

    const result = await runtime.query({
      operation: "workspaceSymbols",
      query: "Fn",
      maxResults: 1,
    });

    expect(result.content).toContain("realFn");
    expect(result.content).not.toContain("brokenFn");
    expect(result.content).not.toContain("omitted by maxResults");
  });

  it("filters malformed locations from reference results without crashing", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    executeCommand.mockResolvedValueOnce([
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 8 } },
      },
      {
        uri: { fsPath: `${workspaceRoot}\\src\\agent\\agentRunner.ts` },
        range: { start: { line: 10, character: 0 }, end: { line: 10, character: 8 } },
      },
    ]);

    const result = await runtime.query({
      operation: "findReferences",
      filePath: "src/agent/agentRunner.ts",
      line: 5,
      character: 3,
    });

    expect(result.summary).toContain("returned 1 result");
    expect(result.content).toContain("agentRunner.ts");
  });

  it("keeps malformed call hierarchy items bounded instead of crashing gitignored filtering", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    executeCommand.mockResolvedValueOnce([
      {
        name: "unknownItem",
        kind: 12,
        selectionRange: {
          start: { line: 1, character: 1 },
          end: { line: 1, character: 8 },
        },
      },
    ]);

    const result = await runtime.query({
      operation: "prepareCallHierarchy",
      filePath: "src/lsp/lspRuntime.ts",
      line: 5,
      character: 3,
    });

    expect(result.summary).toContain("returned 1 result");
    expect(result.content).toContain("unknownItem");
    expect(result.content).toContain("<unknown location>");
  });

  it("falls back gracefully when git is unavailable for findReferences", async () => {
    const runtime = new VsCodeLspRuntime(() => workspaceRoot);
    // Simulate git not found (exit code 128)
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        cb(Object.assign(new Error("git not found"), { code: 128 }));
      },
    );
    executeCommand.mockResolvedValueOnce([
      {
        uri: { fsPath: `${workspaceRoot}\\src\\agent\\agentRunner.ts` },
        range: { start: { line: 10, character: 0 }, end: { line: 10, character: 8 } },
      },
      {
        uri: { fsPath: `${workspaceRoot}\\src\\promptTurnHost.ts` },
        range: { start: { line: 30, character: 0 }, end: { line: 30, character: 8 } },
      },
    ]);

    const result = await runtime.query({
      operation: "findReferences",
      filePath: "src/agent/agentRunner.ts",
      line: 5,
      character: 3,
    });

    // Both results kept — no crash, no filtering
    expect(result.content).toContain("agentRunner.ts");
    expect(result.content).toContain("promptTurnHost.ts");
  });

  it("getGitIgnoredPaths returns empty set when all paths are unignored", async () => {
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
        cb(Object.assign(new Error(""), { code: 1 }));
      },
    );

    const ignored = await getGitIgnoredPaths(workspaceRoot, [
      `${workspaceRoot}\\src\\agent\\agentRunner.ts`,
    ]);

    expect(ignored.size).toBe(0);
  });
});
