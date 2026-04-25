import { describe, expect, it } from "vitest";
import { LSP_OPERATIONS, LSP_TOOL_NAME, normalizeLspOperation } from "./types";

describe("lsp types", () => {
  it("exposes the expected LSP tool name", () => {
    expect(LSP_TOOL_NAME).toBe("LSP");
  });

  it("includes the expected official-aligned operation set", () => {
    expect(LSP_OPERATIONS).toEqual([
      "goToDefinition",
      "goToImplementation",
      "findReferences",
      "hover",
      "documentSymbols",
      "documentDiagnostics",
      "workspaceSymbols",
      "prepareCallHierarchy",
      "incomingCalls",
      "outgoingCalls",
    ]);
  });

  it("normalizes Claude singular operation names to internal operations", () => {
    expect(normalizeLspOperation("documentSymbol")).toBe("documentSymbols");
    expect(normalizeLspOperation("workspaceSymbol")).toBe("workspaceSymbols");
  });

  it("keeps existing internal operation names unchanged", () => {
    expect(normalizeLspOperation("documentSymbols")).toBe("documentSymbols");
    expect(normalizeLspOperation("workspaceSymbols")).toBe("workspaceSymbols");
    expect(normalizeLspOperation("goToDefinition")).toBe("goToDefinition");
  });

  it("returns undefined for unknown LSP operation names", () => {
    expect(normalizeLspOperation("document_symbol")).toBeUndefined();
    expect(normalizeLspOperation("")).toBeUndefined();
  });
});
