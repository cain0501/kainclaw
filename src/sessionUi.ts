export const DEFAULT_NEW_SESSION_TITLE = "新对话";

export function getWorkspaceHash(workspaceRoot: string | undefined): string {
  return Buffer.from(workspaceRoot ?? "no-workspace").toString("base64").slice(0, 12);
}

export function buildSessionExportPath(
  workspaceRoot: string | undefined,
  title: string,
): string | undefined {
  if (!workspaceRoot) {
    return undefined;
  }

  const safeTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, "_");
  return `${workspaceRoot}/${safeTitle}.md`;
}

export function buildSessionExportSuccessMessage(targetPath: string): string {
  return `对话已导出到 ${targetPath}`;
}
