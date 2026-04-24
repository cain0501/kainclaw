/**
 * Swarm type definitions (Spec §P04).
 *
 * Coordinator = the user's default main provider, same as a normal conversation
 * Worker      = any named provider alias configured in settings
 *
 * The key difference is that Coordinator and Worker can use different providers;
 * they are not locked to the same backend.
 */

export type WorkerStatus = "pending" | "running" | "done" | "error" | "timeout";

export type WorkerState = {
  id: string; // Unique id, for example "worker-0"
  name: string; // User-facing label, for example "安全扫描"
  providerAlias: string; // Named provider alias used by this worker
  model: string; // Resolved model name
  task: string; // Task description
  status: WorkerStatus;
  /** Latest output snippet for card preview. */
  latestMessage: string;
  /** Full transcript shown when expanded. */
  transcript: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
  startedAt: number;
  lastProgressAt: number;
  finishedAt?: number;
  error?: string;
};

export type SwarmState = {
  active: boolean;
  workers: WorkerState[];
};

/** Worker tool allowlist, enforced at runtime instead of relying on model discipline. */
export const WORKER_ALLOWED_TOOLS = new Set([
  "read_file",
  "write_file",
  "replace_in_file",
  "glob_files",
  "search_files",
  "LSP",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "list_files",
  "run_command",
  "fetch_url",
  "send_message",
]);

/** Input schema for spawn_agent. */
export type SpawnAgentInput = {
  name: string;
  task: string;
  providerAlias: string;
  allowedTools?: string[];
  maxTurns?: number;
};

/** Input schema for send_message. */
export type SendMessageInput = {
  to: string; // worker id / "coordinator" / "*"
  content: string;
};

/** Input schema for wait_for_agents. */
export type WaitForAgentsInput = {
  ids: string[]; // worker ids
  timeoutMs?: number;
};
