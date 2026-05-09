import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCronExpression } from "./cronUtils";

export type CronTask = {
  id: string;
  cron: string;
  prompt: string;
  createdAt: number;
  lastFiredAt?: number;
  recurring?: boolean;
  durable?: boolean;
};

type CronFile = { tasks: CronTask[] };

const CRON_FILE_REL = path.join(".cain", "scheduled_tasks.json");
const sessionTasks = new Map<string, CronTask>();

export function getCronFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CRON_FILE_REL);
}

export function clearSessionCronTasks(): void {
  sessionTasks.clear();
}

export async function readCronTasks(workspaceRoot: string): Promise<CronTask[]> {
  let raw: string;
  try {
    raw = await readFile(getCronFilePath(workspaceRoot), "utf-8");
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const file = parsed as Partial<CronFile>;
  if (!Array.isArray(file.tasks)) {
    return [];
  }

  const tasks: CronTask[] = [];
  for (const task of file.tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      typeof task.cron !== "string" ||
      typeof task.prompt !== "string" ||
      typeof task.createdAt !== "number"
    ) {
      continue;
    }
    if (!parseCronExpression(task.cron)) {
      continue;
    }
    tasks.push({
      id: task.id,
      cron: task.cron,
      prompt: task.prompt,
      createdAt: task.createdAt,
      ...(typeof task.lastFiredAt === "number"
        ? { lastFiredAt: task.lastFiredAt }
        : {}),
      ...(task.recurring ? { recurring: true } : {}),
    });
  }
  return tasks;
}

export async function writeCronTasks(
  tasks: CronTask[],
  workspaceRoot: string,
): Promise<void> {
  await mkdir(path.join(workspaceRoot, ".cain"), { recursive: true });
  const body: CronFile = {
    tasks: tasks.map(({ durable: _durable, ...rest }) => rest),
  };
  await writeFile(
    getCronFilePath(workspaceRoot),
    `${JSON.stringify(body, null, 2)}\n`,
    "utf-8",
  );
}

export async function addCronTask(
  cron: string,
  prompt: string,
  recurring: boolean,
  durable: boolean,
  workspaceRoot: string,
): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const task: CronTask = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...(recurring ? { recurring: true } : {}),
  };

  if (!durable) {
    sessionTasks.set(id, { ...task, durable: false });
    return id;
  }

  const tasks = await readCronTasks(workspaceRoot);
  tasks.push(task);
  await writeCronTasks(tasks, workspaceRoot);
  return id;
}

export async function removeCronTasks(
  ids: string[],
  workspaceRoot: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  for (const id of ids) {
    sessionTasks.delete(id);
  }
  const tasks = await readCronTasks(workspaceRoot);
  const remaining = tasks.filter(task => !idSet.has(task.id));
  if (remaining.length < tasks.length) {
    await writeCronTasks(remaining, workspaceRoot);
  }
}

export async function listAllCronTasks(
  workspaceRoot: string,
): Promise<CronTask[]> {
  const fileTasks = await readCronTasks(workspaceRoot);
  const memoryTasks = [...sessionTasks.values()];
  return [...fileTasks, ...memoryTasks];
}

export async function markCronTaskFired(
  id: string,
  firedAt: number,
  workspaceRoot: string,
): Promise<void> {
  const task = sessionTasks.get(id);
  if (task) {
    task.lastFiredAt = firedAt;
    sessionTasks.set(id, task);
    return;
  }

  const tasks = await readCronTasks(workspaceRoot);
  const existing = tasks.find(candidate => candidate.id === id);
  if (!existing) {
    return;
  }
  existing.lastFiredAt = firedAt;
  await writeCronTasks(tasks, workspaceRoot);
}
