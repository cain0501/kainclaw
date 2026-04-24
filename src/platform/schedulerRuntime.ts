/**
 * Cron scheduler capability surface.
 * Future implementation: src/scheduler/schedulerRuntime.ts
 * Consumers: ElectronChatPanel, cron tool in toolRuntime, p3-cron-scheduled-tasks spec
 */

export type CronJobDef = {
  id: string;
  name: string;
  cronExpr: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
};

export type CronJobStatus = "idle" | "running" | "error";

export type CronJob = CronJobDef & {
  status: CronJobStatus;
  lastRunAt?: number;
  lastError?: string;
  nextRunAt?: number;
};

export interface ISchedulerRuntime {
  init(): Promise<void>;
  addJob(def: Omit<CronJobDef, "createdAt">): Promise<CronJob>;
  removeJob(id: string): Promise<void>;
  enableJob(id: string): Promise<void>;
  disableJob(id: string): Promise<void>;
  listJobs(): Promise<CronJob[]>;
  dispose(): Promise<void>;
}
