import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import type { ToolExecutionResult } from "../toolRuntime";
import {
  formatDefinitionResult,
  formatDocumentDiagnosticsResult,
  formatDocumentSymbolsResult,
  formatHoverResults,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatReferencesResult,
  formatWorkspaceSymbolsResult,
} from "./formatters";
import type { LspOperation, LspQueryInput } from "./types";

const execFileAsync = promisify(execFile);

export type LspToolAdapter = {
  query(input: LspQueryInput): Promise<ToolExecutionResult>;
};

export const LSP_EMPTY_RESULT_RETRY_DELAY_MS = 75;

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }

  return absolutePath;
}

export function assertPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive 1-based integer.`);
  }

  return value;
}

export function toPosition(line: number, character: number): vscode.Position {
  return new vscode.Position(line - 1, character - 1);
}

function resolveRequiredFilePath(
  operation: LspOperation,
  filePath: string | undefined,
): string {
  const trimmedFilePath = filePath?.trim();

  if (!trimmedFilePath) {
    throw new Error(`filePath is required for ${operation}.`);
  }

  return trimmedFilePath;
}

function hasOpenDocument(documentUri: vscode.Uri): boolean {
  return vscode.workspace.textDocuments.some(
    document => document.uri.fsPath === documentUri.fsPath,
  );
}

function isEmptyResult(operation: LspOperation, result: unknown): boolean {
  switch (operation) {
    case "goToDefinition":
    case "goToImplementation":
    case "findReferences":
    case "hover":
    case "documentSymbols":
    case "documentDiagnostics":
    case "prepareCallHierarchy":
    case "incomingCalls":
    case "outgoingCalls":
      return result === undefined || (Array.isArray(result) && result.length === 0);
    case "workspaceSymbols":
      return false;
    default: {
      const exhaustiveCheck: never = operation;
      throw new Error(`Unsupported LSP operation: ${exhaustiveCheck}`);
    }
  }
}

async function waitForLspWarmup(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, LSP_EMPTY_RESULT_RETRY_DELAY_MS));
}

function parseDiagnosticSeverity(
  severity: LspQueryInput["severity"],
): vscode.DiagnosticSeverity | undefined {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    case "hint":
      return vscode.DiagnosticSeverity.Hint;
    default:
      return undefined;
  }
}

function applyResultLimit<T>(
  items: readonly T[] | undefined,
  maxResults: number | undefined,
): { items: T[] | undefined; hiddenCount: number } {
  if (!items || maxResults === undefined || items.length <= maxResults) {
    return {
      items: items ? [...items] : undefined,
      hiddenCount: 0,
    };
  }

  return {
    items: items.slice(0, maxResults),
    hiddenCount: items.length - maxResults,
  };
}

function appendLimitNotice(content: string, visibleCount: number, hiddenCount: number): string {
  if (hiddenCount <= 0) {
    return content;
  }

  return `${content}\n\n[showing first ${visibleCount} result(s); ${hiddenCount} additional result(s) omitted by maxResults]`;
}

async function executeOperation(
  operation: LspOperation,
  options: {
    documentUri?: vscode.Uri;
    position?: vscode.Position;
    query?: string;
  },
): Promise<unknown> {
  switch (operation) {
    case "goToDefinition":
      return vscode.commands.executeCommand<
        vscode.Location | vscode.LocationLink | Array<vscode.Location | vscode.LocationLink> | undefined
      >("vscode.executeDefinitionProvider", options.documentUri, options.position);
    case "goToImplementation":
      return vscode.commands.executeCommand<
        vscode.Location | vscode.LocationLink | Array<vscode.Location | vscode.LocationLink> | undefined
      >("vscode.executeImplementationProvider", options.documentUri, options.position);
    case "findReferences":
      return vscode.commands.executeCommand<vscode.Location[] | undefined>(
        "vscode.executeReferenceProvider",
        options.documentUri,
        options.position,
      );
    case "hover":
      return vscode.commands.executeCommand<vscode.Hover[] | undefined>(
        "vscode.executeHoverProvider",
        options.documentUri,
        options.position,
      );
    case "documentSymbols":
      return vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
      >("vscode.executeDocumentSymbolProvider", options.documentUri!);
    case "documentDiagnostics":
      return vscode.languages.getDiagnostics(options.documentUri!);
    case "workspaceSymbols":
      return vscode.commands.executeCommand<vscode.SymbolInformation[] | undefined>(
        "vscode.executeWorkspaceSymbolProvider",
        options.query ?? "",
      );
    case "prepareCallHierarchy":
    case "incomingCalls":
    case "outgoingCalls":
      return vscode.commands.executeCommand<vscode.CallHierarchyItem[] | undefined>(
        "vscode.prepareCallHierarchy",
        options.documentUri,
        options.position,
      );
    default: {
      const exhaustiveCheck: never = operation;
      throw new Error(`Unsupported LSP operation: ${exhaustiveCheck}`);
    }
  }
}

export async function getGitIgnoredPaths(
  workspaceRoot: string,
  absolutePaths: string[],
): Promise<Set<string>> {
  if (absolutePaths.length === 0) {
    return new Set();
  }
  const relPaths = absolutePaths.map(p =>
    path.relative(workspaceRoot, p).replace(/\\/g, "/"),
  );
  try {
    const { stdout } = await execFileAsync("git", ["check-ignore", "--", ...relPaths], {
      cwd: workspaceRoot,
    });
    const ignoredNormalized = new Set(
      stdout.split("\n").map(l => l.trim()).filter(Boolean),
    );
    return new Set(absolutePaths.filter((_, i) => ignoredNormalized.has(relPaths[i]!)));
  } catch {
    // exit code 1 = no paths ignored (normal); any other error = git unavailable / not a repo
    return new Set();
  }
}

function getLocationFsPath(loc: vscode.Location | vscode.LocationLink): string {
  if ("targetUri" in loc) {
    return (loc as vscode.LocationLink).targetUri.fsPath;
  }
  return (loc as vscode.Location).uri.fsPath;
}

function getCallHierarchyItemFsPath(item: vscode.CallHierarchyItem): string {
  return item.uri.fsPath;
}

async function filterGitIgnoredLocations<T extends vscode.Location | vscode.LocationLink>(
  workspaceRoot: string,
  items: T[],
): Promise<T[]> {
  const paths = items.map(getLocationFsPath);
  const ignored = await getGitIgnoredPaths(workspaceRoot, paths);
  if (ignored.size === 0) {
    return items;
  }
  return items.filter(item => !ignored.has(getLocationFsPath(item)));
}

async function filterGitIgnoredSymbols(
  workspaceRoot: string,
  items: vscode.SymbolInformation[],
): Promise<vscode.SymbolInformation[]> {
  const paths = items.map(s => s.location.uri.fsPath);
  const ignored = await getGitIgnoredPaths(workspaceRoot, paths);
  if (ignored.size === 0) {
    return items;
  }
  return items.filter(s => !ignored.has(s.location.uri.fsPath));
}

async function filterGitIgnoredCallHierarchyItems(
  workspaceRoot: string,
  items: vscode.CallHierarchyItem[],
): Promise<vscode.CallHierarchyItem[]> {
  const paths = items.map(getCallHierarchyItemFsPath);
  const ignored = await getGitIgnoredPaths(workspaceRoot, paths);
  if (ignored.size === 0) {
    return items;
  }
  return items.filter(item => !ignored.has(getCallHierarchyItemFsPath(item)));
}

async function filterGitIgnoredIncomingCalls(
  workspaceRoot: string,
  calls: vscode.CallHierarchyIncomingCall[],
): Promise<vscode.CallHierarchyIncomingCall[]> {
  const paths = calls.map(call => getCallHierarchyItemFsPath(call.from));
  const ignored = await getGitIgnoredPaths(workspaceRoot, paths);
  if (ignored.size === 0) {
    return calls;
  }
  return calls.filter(call => !ignored.has(getCallHierarchyItemFsPath(call.from)));
}

async function filterGitIgnoredOutgoingCalls(
  workspaceRoot: string,
  calls: vscode.CallHierarchyOutgoingCall[],
): Promise<vscode.CallHierarchyOutgoingCall[]> {
  const paths = calls.map(call => getCallHierarchyItemFsPath(call.to));
  const ignored = await getGitIgnoredPaths(workspaceRoot, paths);
  if (ignored.size === 0) {
    return calls;
  }
  return calls.filter(call => !ignored.has(getCallHierarchyItemFsPath(call.to)));
}

export class VsCodeLspRuntime implements LspToolAdapter {
  constructor(private readonly getWorkspaceRoot: () => string) {}

  async query(input: LspQueryInput): Promise<ToolExecutionResult> {
    const workspaceRoot = this.getWorkspaceRoot();
    const requiresPosition =
      input.operation === "goToDefinition" ||
      input.operation === "goToImplementation" ||
      input.operation === "findReferences" ||
      input.operation === "hover" ||
      input.operation === "prepareCallHierarchy" ||
      input.operation === "incomingCalls" ||
      input.operation === "outgoingCalls";
    const requiresFilePath =
      requiresPosition ||
      input.operation === "documentSymbols" ||
      input.operation === "documentDiagnostics";

    const resolvedFilePath = requiresFilePath
      ? resolveRequiredFilePath(input.operation, input.filePath)
      : undefined;
    const filePath = resolvedFilePath ?? input.filePath?.trim();
    const absolutePath =
      resolvedFilePath ? resolveWorkspacePath(workspaceRoot, resolvedFilePath) : undefined;
    const documentUri = absolutePath ? vscode.Uri.file(absolutePath) : undefined;
    const wasDocumentOpen = documentUri ? hasOpenDocument(documentUri) : false;

    if (documentUri) {
      await vscode.workspace.openTextDocument(documentUri);
    }

    const position = requiresPosition
      ? toPosition(
          assertPositiveInteger(input.line, "line"),
          assertPositiveInteger(input.character, "character"),
        )
      : undefined;
    const query =
      input.operation === "workspaceSymbols" && typeof input.query === "string"
        ? input.query.trim()
        : undefined;
    const maxResults =
      input.maxResults === undefined
        ? undefined
        : assertPositiveInteger(input.maxResults, "maxResults");
    const itemIndex =
      input.itemIndex === undefined
        ? undefined
        : assertPositiveInteger(input.itemIndex, "itemIndex");
    const diagnosticSeverity = parseDiagnosticSeverity(input.severity);

    let operationResult = await executeOperation(
      input.operation,
      {
        documentUri,
        position,
        query,
      },
    );

    if (
      documentUri &&
      !wasDocumentOpen &&
      isEmptyResult(input.operation, operationResult)
    ) {
      await waitForLspWarmup();
      operationResult = await executeOperation(
        input.operation,
        {
          documentUri,
          position,
          query,
        },
      );
    }

    let formatted: { text: string; resultCount: number; fileCount: number };
    let hiddenCount = 0;

    switch (input.operation) {
      case "goToDefinition":
      case "goToImplementation": {
        const rawResults = operationResult as
          | vscode.Location
          | vscode.LocationLink
          | Array<vscode.Location | vscode.LocationLink>
          | undefined;
        const arrayResults = rawResults
          ? Array.isArray(rawResults)
            ? rawResults
            : [rawResults]
          : undefined;
        const filteredDefResults = arrayResults
          ? await filterGitIgnoredLocations(workspaceRoot, arrayResults)
          : undefined;
        const limitedDef = applyResultLimit(filteredDefResults, maxResults);
        hiddenCount = limitedDef.hiddenCount;
        formatted = formatDefinitionResult(
          workspaceRoot,
          limitedDef.items == null
            ? undefined
            : limitedDef.items.length === 1
              ? limitedDef.items[0]
              : limitedDef.items,
        );
        break;
      }
      case "findReferences": {
        const refs = operationResult as vscode.Location[] | undefined;
        const filteredRefs = refs
          ? await filterGitIgnoredLocations(workspaceRoot, refs)
          : undefined;
        const limitedRefs = applyResultLimit(filteredRefs, maxResults);
        hiddenCount = limitedRefs.hiddenCount;
        formatted = formatReferencesResult(workspaceRoot, limitedRefs.items);
        break;
      }
      case "hover":
        formatted = formatHoverResults(operationResult as vscode.Hover[] | undefined);
        break;
      case "documentSymbols":
        formatted = formatDocumentSymbolsResult(
          workspaceRoot,
          filePath ?? "(unknown)",
          operationResult as vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined,
        );
        break;
      case "documentDiagnostics":
        {
          const filteredDiagnostics = ((operationResult as readonly vscode.Diagnostic[] | undefined) ?? []).filter(
            diagnostic =>
              diagnosticSeverity === undefined || diagnostic.severity === diagnosticSeverity,
          );
          const limited = applyResultLimit(filteredDiagnostics, maxResults);
          hiddenCount = limited.hiddenCount;
          formatted = formatDocumentDiagnosticsResult(
            workspaceRoot,
            filePath ?? "(unknown)",
            limited.items ?? [],
          );
        }
        break;
      case "workspaceSymbols": {
        const syms = operationResult as vscode.SymbolInformation[] | undefined;
        const filteredSyms = syms
          ? await filterGitIgnoredSymbols(workspaceRoot, syms)
          : undefined;
        const limitedSyms = applyResultLimit(filteredSyms, maxResults);
        hiddenCount = limitedSyms.hiddenCount;
        formatted = formatWorkspaceSymbolsResult(
          workspaceRoot,
          query ?? "",
          limitedSyms.items,
        );
        break;
      }
      case "prepareCallHierarchy":
        {
          const rawItems = operationResult as vscode.CallHierarchyItem[] | undefined;
          const items = rawItems
            ? await filterGitIgnoredCallHierarchyItems(workspaceRoot, rawItems)
            : undefined;
          if (
            itemIndex !== undefined &&
            (!items || itemIndex > items.length)
          ) {
            throw new Error(`itemIndex ${itemIndex} is out of range for prepareCallHierarchy.`);
          }
          const selectedItems = itemIndex !== undefined && items
            ? [items[itemIndex - 1]!]
            : items;
          const limited = applyResultLimit(selectedItems, maxResults);
          hiddenCount = limited.hiddenCount;
          formatted = formatPrepareCallHierarchyResult(
            workspaceRoot,
            limited.items,
          );
        }
        break;
      case "incomingCalls":
      case "outgoingCalls": {
        const rawItems = operationResult as vscode.CallHierarchyItem[] | undefined;
        const items = rawItems
          ? await filterGitIgnoredCallHierarchyItems(workspaceRoot, rawItems)
          : undefined;
        if (!items || items.length === 0) {
          formatted = formatPrepareCallHierarchyResult(workspaceRoot, items);
          break;
        }
        if (itemIndex !== undefined && itemIndex > items.length) {
          throw new Error(`itemIndex ${itemIndex} is out of range for ${input.operation}.`);
        }
        const targetItem =
          itemIndex !== undefined ? items[itemIndex - 1]! : items[0];

        const rawCallResult = await vscode.commands.executeCommand<
          vscode.CallHierarchyIncomingCall[] | vscode.CallHierarchyOutgoingCall[] | undefined
        >(
          input.operation === "incomingCalls"
            ? "vscode.provideIncomingCalls"
            : "vscode.provideOutgoingCalls",
          targetItem,
        );

        if (input.operation === "incomingCalls") {
          const filteredCalls = rawCallResult
            ? await filterGitIgnoredIncomingCalls(
                workspaceRoot,
                rawCallResult as vscode.CallHierarchyIncomingCall[],
              )
            : undefined;
          const limited = applyResultLimit(
            filteredCalls,
            maxResults,
          );
          hiddenCount = limited.hiddenCount;
          formatted = formatIncomingCallsResult(
            workspaceRoot,
            limited.items,
          );
        } else {
          const filteredCalls = rawCallResult
            ? await filterGitIgnoredOutgoingCalls(
                workspaceRoot,
                rawCallResult as vscode.CallHierarchyOutgoingCall[],
              )
            : undefined;
          const limited = applyResultLimit(
            filteredCalls,
            maxResults,
          );
          hiddenCount = limited.hiddenCount;
          formatted = formatOutgoingCallsResult(
            workspaceRoot,
            limited.items,
          );
        }
        break;
      }
      default: {
        const exhaustiveCheck: never = input.operation;
        throw new Error(`Unsupported LSP operation: ${exhaustiveCheck}`);
      }
    }

    return {
      summary: `LSP ${input.operation} returned ${formatted.resultCount} result(s) across ${formatted.fileCount} file(s)`,
      content: appendLimitNotice(formatted.text, formatted.resultCount, hiddenCount),
    };
  }
}
