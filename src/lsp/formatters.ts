import path from "node:path";
import * as vscode from "vscode";

function formatWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const relativePath = path.relative(workspaceRoot, targetPath);
  if (!relativePath || relativePath.startsWith("..")) {
    return targetPath.replace(/\\/g, "/");
  }
  return relativePath.replace(/\\/g, "/");
}

function getUriFsPath(uri: vscode.Uri | undefined): string | undefined {
  return typeof uri?.fsPath === "string" && uri.fsPath.trim() !== ""
    ? uri.fsPath
    : undefined;
}

function uriToPath(workspaceRoot: string, uri: vscode.Uri | undefined): string {
  const fsPath = getUriFsPath(uri);
  return fsPath ? formatWorkspacePath(workspaceRoot, fsPath) : "<unknown location>";
}

function getLocationUri(location: vscode.Location | vscode.LocationLink): vscode.Uri | undefined {
  return "targetUri" in location
    ? (location as vscode.LocationLink).targetUri
    : (location as vscode.Location).uri;
}

function getLocationRange(
  location: vscode.Location | vscode.LocationLink,
): vscode.Range | undefined {
  if ("targetUri" in location) {
    return (location as vscode.LocationLink).targetSelectionRange
      ?? (location as vscode.LocationLink).targetRange;
  }

  return (location as vscode.Location).range;
}

function hasUsableLocation(
  location: vscode.Location | vscode.LocationLink | undefined,
): location is vscode.Location | vscode.LocationLink {
  return !!location && !!getUriFsPath(getLocationUri(location)) && !!getLocationRange(location)?.start;
}

function getUniqueFileCount(uris: Array<vscode.Uri | undefined>): number {
  return new Set(
    uris
      .map(getUriFsPath)
      .filter((fsPath): fsPath is string => !!fsPath),
  ).size;
}

function formatLocation(workspaceRoot: string, location: vscode.Location): string {
  const filePath = uriToPath(workspaceRoot, location.uri);
  const start = location.range?.start;
  if (!start) {
    return `${filePath}:?:?`;
  }
  return `${filePath}:${start.line + 1}:${start.character + 1}`;
}

function toLocation(location: vscode.Location | vscode.LocationLink): vscode.Location {
  if ("targetUri" in location) {
    return {
      uri: location.targetUri,
      range: location.targetSelectionRange ?? location.targetRange,
    } as vscode.Location;
  }

  return location;
}

function extractHoverText(hover: vscode.Hover): string {
  return hover.contents
    .map(content => {
      if (content instanceof vscode.MarkdownString) {
        return content.value;
      }

      if (typeof content === "string") {
        return content;
      }

      if ("value" in content) {
        return content.value;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function formatCallHierarchyItem(
  workspaceRoot: string,
  item: vscode.CallHierarchyItem,
): string {
  const filePath = uriToPath(workspaceRoot, item.uri);
  const start = item.selectionRange?.start ?? item.range?.start;
  if (!getUriFsPath(item.uri) || !start) {
    return `${item.name} (${item.kind}) - <unknown location>`;
  }
  const line = start.line + 1;
  const character = start.character + 1;
  return `${item.name} (${item.kind}) - ${filePath}:${line}:${character}`;
}

export function formatDefinitionResult(
  workspaceRoot: string,
  result: vscode.Location | vscode.LocationLink | Array<vscode.Location | vscode.LocationLink> | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!result) {
    return {
      text: "No definition found. The symbol may not be resolvable here, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const locations = (Array.isArray(result) ? result : [result])
    .filter(hasUsableLocation)
    .map(toLocation);

  if (locations.length === 0) {
    return {
      text: "No definition found. The symbol may not be resolvable here, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const fileCount = getUniqueFileCount(locations.map(location => location.uri));

  if (locations.length === 1) {
    return {
      text: `Defined in ${formatLocation(workspaceRoot, locations[0]!)}`,
      resultCount: 1,
      fileCount,
    };
  }

  return {
    text: `Found ${locations.length} definitions:\n${locations
      .map(location => `- ${formatLocation(workspaceRoot, location)}`)
      .join("\n")}`,
    resultCount: locations.length,
    fileCount,
  };
}

function getSymbolKindLabel(kind: vscode.SymbolKind): string {
  return vscode.SymbolKind[kind] ?? String(kind);
}

function formatDocumentSymbol(
  workspaceRoot: string,
  symbol: vscode.DocumentSymbol,
  depth = 0,
): string[] {
  const indent = "  ".repeat(depth);
  const line = symbol.selectionRange.start.line + 1;
  const character = symbol.selectionRange.start.character + 1;
  const lines = [
    `${indent}- ${symbol.name} (${getSymbolKindLabel(symbol.kind)}) @ ${line}:${character}`,
  ];

  for (const child of symbol.children) {
    lines.push(...formatDocumentSymbol(workspaceRoot, child, depth + 1));
  }

  return lines;
}

export function formatDocumentSymbolsResult(
  workspaceRoot: string,
  filePath: string,
  symbols: vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!symbols || symbols.length === 0) {
    return {
      text: "No document symbols found. The file may not expose symbols, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const firstSymbol = symbols[0];
  if (firstSymbol instanceof vscode.DocumentSymbol) {
    const documentSymbols = symbols as vscode.DocumentSymbol[];
    const lines = [`Document symbols for ${filePath}:`];
    for (const symbol of documentSymbols) {
      lines.push(...formatDocumentSymbol(workspaceRoot, symbol));
    }
    return {
      text: lines.join("\n"),
      resultCount: documentSymbols.length,
      fileCount: 1,
    };
  }

  const infoSymbols = (symbols as vscode.SymbolInformation[]).filter(
    symbol => !!getUriFsPath(symbol.location?.uri) && !!symbol.location?.range?.start,
  );
  if (infoSymbols.length === 0) {
    return {
      text: "No document symbols found. The file may not expose symbols, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: `Document symbols for ${filePath}:\n${infoSymbols
      .map(
        symbol =>
          `- ${symbol.name} (${getSymbolKindLabel(symbol.kind)}) @ ${formatLocation(
            workspaceRoot,
            symbol.location,
          )}`,
      )
      .join("\n")}`,
    resultCount: infoSymbols.length,
    fileCount: getUniqueFileCount(infoSymbols.map(symbol => symbol.location.uri)),
  };
}

export function formatWorkspaceSymbolsResult(
  workspaceRoot: string,
  query: string,
  symbols: vscode.SymbolInformation[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!symbols || symbols.length === 0) {
    return {
      text: `No workspace symbols found for "${query}". The workspace may not contain matching symbols, or the language provider may still be indexing.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  const validSymbols = symbols.filter(
    symbol => !!getUriFsPath(symbol.location?.uri) && !!symbol.location?.range?.start,
  );

  if (validSymbols.length === 0) {
    return {
      text: `No workspace symbols found for "${query}". The workspace may not contain matching symbols, or the language provider may still be indexing.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: `Found ${validSymbols.length} workspace symbol(s) for "${query}":\n${validSymbols
      .map(
        symbol =>
          `- ${symbol.name} (${getSymbolKindLabel(symbol.kind)}) @ ${formatLocation(
            workspaceRoot,
            symbol.location,
          )}`,
      )
      .join("\n")}`,
    resultCount: validSymbols.length,
    fileCount: getUniqueFileCount(validSymbols.map(symbol => symbol.location.uri)),
  };
}

export function formatDocumentDiagnosticsResult(
  workspaceRoot: string,
  filePath: string,
  diagnostics: readonly vscode.Diagnostic[],
): { text: string; resultCount: number; fileCount: number } {
  if (!diagnostics || diagnostics.length === 0) {
    return {
      text: `No diagnostics found for ${filePath}. The file may be clean, or diagnostics may still be initializing.`,
      resultCount: 0,
      fileCount: 1,
    };
  }

  const severityLabels = {
    [vscode.DiagnosticSeverity.Error]: "Error",
    [vscode.DiagnosticSeverity.Warning]: "Warning",
    [vscode.DiagnosticSeverity.Information]: "Info",
    [vscode.DiagnosticSeverity.Hint]: "Hint",
  } as const;

  return {
    text: `Diagnostics for ${filePath}:\n${diagnostics
      .map(diagnostic => {
        const line = diagnostic.range.start.line + 1;
        const character = diagnostic.range.start.character + 1;
        const severity = severityLabels[diagnostic.severity] ?? "Unknown";
        const code =
          diagnostic.code === undefined
            ? ""
            : typeof diagnostic.code === "string" || typeof diagnostic.code === "number"
              ? ` [${diagnostic.code}]`
              : diagnostic.code.value
                ? ` [${diagnostic.code.value}]`
                : "";
        return `- ${severity}${code} @ ${line}:${character} - ${diagnostic.message}`;
      })
      .join("\n")}`,
    resultCount: diagnostics.length,
    fileCount: 1,
  };
}

export function formatReferencesResult(
  workspaceRoot: string,
  references: vscode.Location[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!references || references.length === 0) {
    return {
      text: "No references found. The symbol may have no usages, or the language provider may still be indexing the workspace.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const validReferences = references.filter(reference => hasUsableLocation(reference));

  if (validReferences.length === 0) {
    return {
      text: "No references found. The symbol may have no usages, or the language provider may still be indexing the workspace.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const byFile = new Map<string, vscode.Location[]>();
  for (const reference of validReferences) {
    const filePath = uriToPath(workspaceRoot, reference.uri);
    const entries = byFile.get(filePath) ?? [];
    entries.push(reference);
    byFile.set(filePath, entries);
  }

  const lines = [`Found ${validReferences.length} references across ${byFile.size} files:`];
  for (const [filePath, fileReferences] of byFile) {
    lines.push(`${filePath}:`);
    for (const reference of fileReferences) {
      lines.push(
        `- ${reference.range.start.line + 1}:${reference.range.start.character + 1}`,
      );
    }
  }

  return {
    text: lines.join("\n"),
    resultCount: validReferences.length,
    fileCount: byFile.size,
  };
}

export function formatHoverResults(
  hovers: vscode.Hover[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!hovers || hovers.length === 0) {
    return {
      text: "No hover information available. The cursor may not be on a symbol, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  const sections = hovers
    .map(extractHoverText)
    .filter(Boolean);

  if (sections.length === 0) {
    return {
      text: "No hover information available. The cursor may not be on a symbol, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: sections.join("\n\n---\n\n"),
    resultCount: sections.length,
    fileCount: 1,
  };
}

export function formatPrepareCallHierarchyResult(
  workspaceRoot: string,
  items: vscode.CallHierarchyItem[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  if (!items || items.length === 0) {
    return {
      text: "No call hierarchy item found at this position. The symbol may not support call hierarchy, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: `Found ${items.length} call hierarchy item(s):\n${items
      .map(item => `- ${formatCallHierarchyItem(workspaceRoot, item)}`)
      .join("\n")}`,
    resultCount: items.length,
    fileCount: getUniqueFileCount(items.map(item => item.uri)),
  };
}

export function formatIncomingCallsResult(
  workspaceRoot: string,
  calls: vscode.CallHierarchyIncomingCall[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  const validCalls = calls?.filter(call => !!call.from) ?? [];
  if (validCalls.length === 0) {
    return {
      text: "No incoming calls found. The symbol may have no callers, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: `Found ${validCalls.length} incoming call(s):\n${validCalls
      .map(call => {
        const ranges = call.fromRanges
          .map(range => `${range.start.line + 1}:${range.start.character + 1}`)
          .join(", ");
        return `- ${formatCallHierarchyItem(workspaceRoot, call.from)}${ranges ? ` | from ${ranges}` : ""}`;
      })
      .join("\n")}`,
    resultCount: validCalls.length,
    fileCount: getUniqueFileCount(validCalls.map(call => call.from.uri)),
  };
}

export function formatOutgoingCallsResult(
  workspaceRoot: string,
  calls: vscode.CallHierarchyOutgoingCall[] | undefined,
): { text: string; resultCount: number; fileCount: number } {
  const validCalls = calls?.filter(call => !!call.to) ?? [];
  if (validCalls.length === 0) {
    return {
      text: "No outgoing calls found. The symbol may have no callees, or the language provider may still be initializing.",
      resultCount: 0,
      fileCount: 0,
    };
  }

  return {
    text: `Found ${validCalls.length} outgoing call(s):\n${validCalls
      .map(call => {
        const ranges = call.fromRanges
          .map(range => `${range.start.line + 1}:${range.start.character + 1}`)
          .join(", ");
        return `- ${formatCallHierarchyItem(workspaceRoot, call.to)}${ranges ? ` | from ${ranges}` : ""}`;
      })
      .join("\n")}`,
    resultCount: validCalls.length,
    fileCount: getUniqueFileCount(validCalls.map(call => call.to.uri)),
  };
}
