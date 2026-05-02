export type DetachedBackgroundTaskMetadata = {
  mode: "detached";
  statePath: string;
  outputPath: string;
  cancelPath: string;
  configPath?: string;
  runnerPid?: number;
};

export type DetachedBackgroundTaskState = {
  status: "running" | "completed" | "failed" | "cancelled" | "killed";
  updatedAt: number;
  runnerPid?: number;
  childPid?: number;
  exitCode?: number | null;
  result?: string;
  error?: string;
};

export function parseDetachedBackgroundTaskMetadata(
  metadata: Record<string, unknown> | undefined,
): DetachedBackgroundTaskMetadata | null {
  if (!metadata) {
    return null;
  }

  const detached = metadata.detached;
  if (!detached || typeof detached !== "object" || Array.isArray(detached)) {
    return null;
  }

  const detachedRecord = detached as Record<string, unknown>;
  if (detachedRecord.mode !== "detached") {
    return null;
  }

  const statePath =
    typeof detachedRecord.statePath === "string" ? detachedRecord.statePath.trim() : "";
  const outputPath =
    typeof detachedRecord.outputPath === "string" ? detachedRecord.outputPath.trim() : "";
  const cancelPath =
    typeof detachedRecord.cancelPath === "string" ? detachedRecord.cancelPath.trim() : "";
  const configPath =
    typeof detachedRecord.configPath === "string" && detachedRecord.configPath.trim()
      ? detachedRecord.configPath.trim()
      : undefined;
  const runnerPid =
    typeof detachedRecord.runnerPid === "number" && Number.isFinite(detachedRecord.runnerPid)
      ? detachedRecord.runnerPid
      : undefined;

  if (!statePath || !outputPath || !cancelPath) {
    return null;
  }

  return {
    mode: "detached",
    statePath,
    outputPath,
    cancelPath,
    ...(configPath ? { configPath } : {}),
    ...(runnerPid !== undefined ? { runnerPid } : {}),
  };
}

export function parseDetachedBackgroundTaskState(
  value: unknown,
): DetachedBackgroundTaskState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawStatus = record.status;
  if (
    rawStatus !== "running" &&
    rawStatus !== "completed" &&
    rawStatus !== "failed" &&
    rawStatus !== "cancelled" &&
    rawStatus !== "killed"
  ) {
    return null;
  }

  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : Date.now();
  const childPid =
    typeof record.childPid === "number" && Number.isFinite(record.childPid)
      ? record.childPid
      : undefined;
  const runnerPid =
    typeof record.runnerPid === "number" && Number.isFinite(record.runnerPid)
      ? record.runnerPid
      : undefined;
  const exitCode =
    typeof record.exitCode === "number" && Number.isFinite(record.exitCode)
      ? record.exitCode
      : record.exitCode === null
        ? null
        : undefined;
  const result =
    typeof record.result === "string" && record.result.trim() ? record.result : undefined;
  const error =
    typeof record.error === "string" && record.error.trim() ? record.error : undefined;

  return {
    status: rawStatus,
    updatedAt,
    ...(childPid !== undefined ? { childPid } : {}),
    ...(runnerPid !== undefined ? { runnerPid } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(result ? { result } : {}),
    ...(error ? { error } : {}),
  };
}
