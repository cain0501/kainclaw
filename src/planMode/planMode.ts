import { promises as fs } from "node:fs";
import path from "node:path";

export type PlanModeState = {
  active: boolean;
  planFilePath?: string;
  conversationKey?: string;
};

export type PlanFileInfo = {
  absolutePath: string;
  relativePath: string;
  created: boolean;
  content: string;
};

const PLAN_ROOT_SEGMENTS = [".cain-artifacts", "plans"] as const;

function createInitialPlanContent(): string {
  return [
    "# Implementation Plan",
    "",
    "## Goal",
    "- Describe the requested change and key constraints.",
    "",
    "## Codebase Findings",
    "- Record the relevant files, patterns, and dependencies you discover.",
    "",
    "## Proposed Changes",
    "- Outline the implementation steps before coding.",
    "",
    "## Open Questions",
    "- Capture any uncertainties that need clarification.",
    "",
    "## Validation",
    "- List the checks or tests to run after implementation.",
    "",
  ].join("\n");
}

export function normalizeWorkspaceRelativePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function getPlanRelativePath(conversationKey: string): string {
  return normalizeWorkspaceRelativePath(
    path.join(...PLAN_ROOT_SEGMENTS, `${conversationKey}.md`),
  );
}

export function getPlanAbsolutePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  return path.join(workspaceRoot, relativePath);
}

export async function ensurePlanFile(
  workspaceRoot: string,
  conversationKey: string,
): Promise<PlanFileInfo> {
  const relativePath = getPlanRelativePath(conversationKey);
  const absolutePath = getPlanAbsolutePath(workspaceRoot, relativePath);
  const directoryPath = path.dirname(absolutePath);

  await fs.mkdir(directoryPath, { recursive: true });

  try {
    const content = await fs.readFile(absolutePath, "utf8");
    return {
      absolutePath,
      relativePath,
      created: false,
      content,
    };
  } catch {
    const content = createInitialPlanContent();
    await fs.writeFile(absolutePath, content, "utf8");
    return {
      absolutePath,
      relativePath,
      created: true,
      content,
    };
  }
}

export async function readPlanFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const absolutePath = getPlanAbsolutePath(workspaceRoot, relativePath);
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

export function isPlanWritablePath(
  targetPath: string,
  planFilePath: string,
): boolean {
  return (
    normalizeWorkspaceRelativePath(targetPath).toLowerCase() ===
    normalizeWorkspaceRelativePath(planFilePath).toLowerCase()
  );
}

