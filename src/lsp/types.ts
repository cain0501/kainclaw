export const LSP_TOOL_NAME = "LSP" as const;

export const LSP_OPERATIONS = [
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
] as const;

export type LspOperation = (typeof LSP_OPERATIONS)[number];

export type LspQueryInput = {
  operation: LspOperation;
  filePath?: string;
  line?: number;
  character?: number;
  query?: string;
  severity?: "error" | "warning" | "info" | "hint";
  maxResults?: number;
  itemIndex?: number;
};
