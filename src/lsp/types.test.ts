import { describe, expect, it } from "vitest";
import { LSP_OPERATIONS, LSP_TOOL_NAME } from "./types";

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
});
