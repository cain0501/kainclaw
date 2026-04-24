import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class MarkdownString {
    value: string;

    constructor(value: string) {
      this.value = value;
    }
  }

  class Location {
    uri: { fsPath: string };
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };

    constructor(
      uri: { fsPath: string },
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      },
    ) {
      this.uri = uri;
      this.range = range;
    }
  }

  class DocumentSymbol {
    name: string;
    detail: string;
    kind: number;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    selectionRange: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    children: DocumentSymbol[];

    constructor(
      name: string,
      detail: string,
      kind: number,
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      },
      selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      },
    ) {
      this.name = name;
      this.detail = detail;
      this.kind = kind;
      this.range = range;
      this.selectionRange = selectionRange;
      this.children = [];
    }
  }

  return {
    MarkdownString,
    Location,
    DocumentSymbol,
    SymbolKind: {
      2: "Module",
      12: "Function",
      Module: 2,
      Function: 12,
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
  };
});

import * as vscode from "vscode";
import {
  formatDefinitionResult,
  formatDocumentDiagnosticsResult,
  formatDocumentSymbolsResult,
  formatHoverResults,
  formatWorkspaceSymbolsResult,
} from "./formatters";

describe("lsp formatters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats a single definition result", () => {
    const location = new vscode.Location(
      { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\index.ts" } as any,
      {
        start: { line: 9, character: 4 },
        end: { line: 9, character: 10 },
      } as any,
    );

    const result = formatDefinitionResult(
      "E:\\claudecodejingiang\\vscode-extension",
      location,
    );

    expect(result.resultCount).toBe(1);
    expect(result.fileCount).toBe(1);
    expect(result.text).toContain("Defined in src/index.ts:10:5");
  });

  it("includes readiness guidance in empty-state formatter messages", () => {
    const definitionResult = formatDefinitionResult(
      "E:\\claudecodejingiang\\vscode-extension",
      undefined,
    );
    expect(definitionResult.text).toContain("language provider may still be initializing");

    const diagnosticsResult = formatDocumentDiagnosticsResult(
      "E:\\claudecodejingiang\\vscode-extension",
      "src/index.ts",
      [],
    );
    expect(diagnosticsResult.text).toContain("diagnostics may still be initializing");
  });

  it("formats document diagnostics with severity and codes", () => {
    const result = formatDocumentDiagnosticsResult(
      "E:\\claudecodejingiang\\vscode-extension",
      "src/index.ts",
      [
        {
          severity: vscode.DiagnosticSeverity.Error,
          code: "TS1005",
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 3 },
          },
          message: "Expected ';'",
        } as any,
      ],
    );

    expect(result.resultCount).toBe(1);
    expect(result.text).toContain("Diagnostics for src/index.ts:");
    expect(result.text).toContain("Error [TS1005] @ 2:3 - Expected ';'");
  });

  it("formats document symbols, hover text, and workspace symbols", () => {
    const symbol = new vscode.DocumentSymbol(
      "runAgent",
      "",
      vscode.SymbolKind.Function,
      {
        start: { line: 20, character: 0 },
        end: { line: 40, character: 0 },
      } as any,
      {
        start: { line: 20, character: 8 },
        end: { line: 20, character: 16 },
      } as any,
    );

    const symbolResult = formatDocumentSymbolsResult(
      "E:\\claudecodejingiang\\vscode-extension",
      "src/agent/agentRunner.ts",
      [symbol] as any,
    );
    expect(symbolResult.text).toContain("Document symbols for src/agent/agentRunner.ts:");
    expect(symbolResult.text).toContain("runAgent (Function) @ 21:9");

    const hoverResult = formatHoverResults([
      {
        contents: [
          new vscode.MarkdownString("`runAgent(history, options)`"),
          "Executes the agent loop.",
        ],
      } as any,
    ]);
    expect(hoverResult.text).toContain("runAgent(history, options)");
    expect(hoverResult.text).toContain("Executes the agent loop.");

    const workspaceResult = formatWorkspaceSymbolsResult(
      "E:\\claudecodejingiang\\vscode-extension",
      "runAgent",
      [
        {
          name: "runAgent",
          kind: vscode.SymbolKind.Function,
          location: new vscode.Location(
            { fsPath: "E:\\claudecodejingiang\\vscode-extension\\src\\agent\\agentRunner.ts" } as any,
            {
              start: { line: 20, character: 8 },
              end: { line: 20, character: 16 },
            } as any,
          ),
        } as any,
      ],
    );
    expect(workspaceResult.text).toContain('Found 1 workspace symbol(s) for "runAgent"');
    expect(workspaceResult.text).toContain("runAgent (Function) @ src/agent/agentRunner.ts:21:9");
  });
});
