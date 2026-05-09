import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addCronTask,
  clearSessionCronTasks,
  getCronFilePath,
  listAllCronTasks,
  readCronTasks,
  removeCronTasks,
} from "./cronTasks";

describe("cronTasks", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "kc-cron-"));
    clearSessionCronTasks();
  });

  afterEach(async () => {
    clearSessionCronTasks();
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("stores session-only tasks in memory and durable tasks on disk", async () => {
    const sessionId = await addCronTask(
      "*/5 * * * *",
      "session prompt",
      true,
      false,
      workspaceRoot,
    );
    const durableId = await addCronTask(
      "0 9 * * *",
      "durable prompt",
      true,
      true,
      workspaceRoot,
    );

    const allTasks = await listAllCronTasks(workspaceRoot);
    expect(allTasks.map(task => task.id)).toContain(sessionId);
    expect(allTasks.map(task => task.id)).toContain(durableId);

    const fileTasks = await readCronTasks(workspaceRoot);
    expect(fileTasks).toHaveLength(1);
    expect(fileTasks[0]?.id).toBe(durableId);

    const fileBody = await readFile(getCronFilePath(workspaceRoot), "utf-8");
    expect(fileBody).toContain(durableId);
    expect(fileBody).not.toContain(sessionId);
  });

  it("removes tasks from both memory and disk", async () => {
    const sessionId = await addCronTask(
      "*/5 * * * *",
      "session prompt",
      true,
      false,
      workspaceRoot,
    );
    const durableId = await addCronTask(
      "0 9 * * *",
      "durable prompt",
      false,
      true,
      workspaceRoot,
    );

    await removeCronTasks([sessionId, durableId], workspaceRoot);

    expect(await listAllCronTasks(workspaceRoot)).toEqual([]);
    expect(await readCronTasks(workspaceRoot)).toEqual([]);
  });
});
