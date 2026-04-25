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

const LSP_OPERATION_ALIASES = {
  documentSymbol: "documentSymbols",
  workspaceSymbol: "workspaceSymbols",
} as const satisfies Record<string, LspOperation>;

export type LspOperationAlias = keyof typeof LSP_OPERATION_ALIASES;
export type LspOperationInput = LspOperation | LspOperationAlias;

export function normalizeLspOperation(operation: string): LspOperation | undefined {
  if (LSP_OPERATIONS.includes(operation as LspOperation)) {
    return operation as LspOperation;
  }

  return LSP_OPERATION_ALIASES[operation as LspOperationAlias];
}

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
