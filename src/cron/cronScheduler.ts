import { nextCronRunMs } from "./cronUtils";
import {
  type CronTask,
  listAllCronTasks,
  markCronTaskFired,
  removeCronTasks,
} from "./cronTasks";

const CHECK_INTERVAL_MS = 1000;
const RECURRING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CronScheduler = {
  start(workspaceRoot: string, onFire: (prompt: string) => void): void;
  stop(): void;
};

export function createCronScheduler(): CronScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let workspaceRoot = "";
  let fire: ((prompt: string) => void) | null = null;

  const nextFireAt = new Map<string, number>();
  const inFlight = new Set<string>();

  function seedNextFire(task: CronTask): void {
    if (nextFireAt.has(task.id)) {
      return;
    }
    const anchor = task.recurring ? (task.lastFiredAt ?? task.createdAt) : task.createdAt;
    nextFireAt.set(task.id, nextCronRunMs(task.cron, anchor) ?? Infinity);
  }

  async function check(): Promise<void> {
    if (stopped || !fire || !workspaceRoot) {
      return;
    }

    const now = Date.now();
    let tasks: CronTask[];
    try {
      tasks = await listAllCronTasks(workspaceRoot);
    } catch {
      return;
    }

    const seen = new Set<string>();
    for (const task of tasks) {
      seen.add(task.id);
      if (inFlight.has(task.id)) {
        continue;
      }
      seedNextFire(task);
      const next = nextFireAt.get(task.id) ?? Infinity;
      if (now < next) {
        continue;
      }

      fire(task.prompt);

      const aged =
        task.recurring &&
        RECURRING_MAX_AGE_MS > 0 &&
        now - task.createdAt >= RECURRING_MAX_AGE_MS;

      if (task.recurring && !aged) {
        nextFireAt.set(task.id, nextCronRunMs(task.cron, now) ?? Infinity);
        if (task.durable !== false) {
          inFlight.add(task.id);
          void markCronTaskFired(task.id, now, workspaceRoot)
            .catch(() => undefined)
            .finally(() => inFlight.delete(task.id));
        }
        continue;
      }

      nextFireAt.delete(task.id);
      inFlight.add(task.id);
      void removeCronTasks([task.id], workspaceRoot)
        .catch(() => undefined)
        .finally(() => inFlight.delete(task.id));
    }

    for (const id of [...nextFireAt.keys()]) {
      if (!seen.has(id)) {
        nextFireAt.delete(id);
      }
    }
  }

  return {
    start(root, onFire) {
      workspaceRoot = root;
      fire = onFire;
      stopped = false;
      if (timer) {
        return;
      }
      timer = setInterval(() => {
        void check();
      }, CHECK_INTERVAL_MS);
      timer.unref?.();
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
