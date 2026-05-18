import type { IProviderAdapter, NormalizedMessage } from "../providers/IProviderAdapter";
import type { ToolDefinition, ToolContext } from "../../toolRuntime";
import { toolDefinitions, executeTool, getOpenAIToolsPayload } from "../../toolRuntime";
import type { WorkerState, SpawnAgentInput, SendMessageInput, WaitForAgentsInput } from "./types";
import { WORKER_ALLOWED_TOOLS } from "./types";
import { SwarmBus } from "./SwarmBus";
import type { ConversationTaskRuntime } from "../../tasks/types";

const MAX_WORKERS = 5;
const WORKER_IDLE_TIMEOUT_MS = 120_000;
const WORKER_HARD_TIMEOUT_MS = 900_000;
const WAIT_DEFAULT_TIMEOUT_MS = 300_000;
const WORKER_SYSTEM_PROMPT_BASE = `You are a focused Worker Agent running as part of a coordinated parallel team.

Role:
- Execute one bounded subtask assigned by the coordinator.
- Finish the assigned slice completely, then report back.
- Do not broaden scope or re-plan the whole task.

Communication:
- To report progress or results, you must call send_message with to="coordinator".
- Plain assistant text is not visible to the coordinator unless you send it through send_message.
- Do not spawn more workers.

Constraints:
- Avoid overlapping edits or simultaneous approval-heavy actions with other workers.
- Do not use plan/review/verification orchestration flows. Leave those to the coordinator.
- Use only the tools you are actually given in this worker session.

Work style:
- Be concise, direct, and execution-focused.
- Prefer reading existing code before editing.
- Keep changes narrow and evidence-based.`;

export type WorkerStateUpdate = (patch: Partial<WorkerState> & { id: string }) => void;

export type SwarmCoordinatorOptions = {
  resolveWorkerProvider: (alias: string, systemPrompt: string) => Promise<IProviderAdapter>;
  onWorkerUpdate: WorkerStateUpdate;
  workerToolContext: ToolContext;
  backgroundTasks?: ConversationTaskRuntime;
};

export class SwarmCoordinator {
  private readonly bus = new SwarmBus();
  private readonly workers = new Map<string, WorkerState>();
  private readonly workerAborts = new Map<string, AbortController>();
  private readonly stopReasons = new Map<string, string>();

  constructor(private readonly opts: SwarmCoordinatorOptions) {
    this.bus.register("coordinator");
  }

  getWorkers(): WorkerState[] {
    return [...this.workers.values()];
  }

  async stopWorker(workerId: string): Promise<{
    taskId: string;
    taskType: "local_agent";
    command: string;
  }> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`No worker found with ID: ${workerId}`);
    }

    if (worker.status !== "running") {
      throw new Error(`Task ${workerId} is not running (status: ${worker.status})`);
    }

    const reason = "Stopped by TaskStop.";
    this.stopReasons.set(workerId, reason);
    this.workerAborts.get(workerId)?.abort();

    const nextState: WorkerState = {
      ...worker,
      status: "error",
      error: reason,
      latestMessage: reason,
      finishedAt: Date.now(),
      lastProgressAt: Date.now(),
    };
    this.workers.set(workerId, nextState);
    this.opts.onWorkerUpdate(nextState);
    this.bus.send({
      from: workerId,
      to: "coordinator",
      content: `[${worker.name} stopped] ${reason}`,
      timestamp: Date.now(),
    });

    if (this.opts.backgroundTasks) {
      await this.opts.backgroundTasks.updateBackgroundTask(workerId, {
        status: "cancelled",
        error: reason,
        result: reason,
        output: reason,
      });
    }

    return {
      taskId: workerId,
      taskType: "local_agent",
      command: worker.task,
    };
  }

  dispose(): void {
    for (const worker of this.workers.values()) {
      if (worker.status === "pending" || worker.status === "running") {
        const reason = "Stopped because the conversation ended.";
        this.stopReasons.set(worker.id, reason);
        this.opts.onWorkerUpdate({
          ...worker,
          status: "error",
          error: reason,
          latestMessage: reason,
          finishedAt: Date.now(),
          lastProgressAt: Date.now(),
        });
        if (this.opts.backgroundTasks) {
          void this.opts.backgroundTasks.updateBackgroundTask(worker.id, {
            status: "cancelled",
            error: reason,
            result: reason,
            output: reason,
          });
        }
      }
    }
    for (const ctrl of this.workerAborts.values()) {
      ctrl.abort();
    }
    this.workerAborts.clear();
    this.workers.clear();
  }

  getSwarmToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: "spawn_agent",
        description:
          "Spawn a Worker Agent to handle a subtask in parallel. " +
          "Workers can read/write files, fetch URLs, and run allowlisted commands " +
          "(some allowlisted commands have side effects and may require approval). " +
          "Assign different files to different Workers and avoid overlapping approval requests. " +
          "At most 5 workers can run at the same time, and workers cannot spawn more workers. " +
          "Returns a worker_id that can be used with send_message and wait_for_agents.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Human-readable worker name" },
            task: { type: "string", description: "Complete task description for the worker" },
            providerAlias: { type: "string", description: "Configured provider alias to use for this worker" },
            maxTurns: { type: "number", description: "Maximum turns, default 20" },
          },
          required: ["name", "task", "providerAlias"],
        },
      },
      {
        name: "send_message",
        description:
          "Send a message to a target agent. The target processes it on its next loop. " +
          "Use a worker id such as 'worker-0', or 'coordinator', or '*' for broadcast.",
        input_schema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Receiver: worker id / 'coordinator' / '*'" },
            content: { type: "string", description: "Message content" },
          },
          required: ["to", "content"],
        },
      },
      {
        name: "wait_for_agents",
        description:
          "Wait for the specified workers to finish or until the wait timeout elapses. " +
          "Returns each worker's final status and output.",
        input_schema: {
          type: "object",
          properties: {
            ids: { type: "string", description: "Comma-separated worker ids, for example 'worker-0,worker-1'" },
            timeoutMs: { type: "number", description: "Wait timeout in ms, default 300000" },
          },
          required: ["ids"],
        },
      },
    ];
  }

  async executeSwarmTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ summary: string; content: string }> {
    switch (name) {
      case "spawn_agent":
        return this.spawnAgent(input as unknown as SpawnAgentInput);
      case "send_message":
        return this.sendMessage(input as unknown as SendMessageInput);
      case "wait_for_agents":
        return this.waitForAgents(input as unknown as WaitForAgentsInput);
      default:
        throw new Error(`Unknown swarm tool: ${name}`);
    }
  }

  private async spawnAgent(input: SpawnAgentInput): Promise<{ summary: string; content: string }> {
    if (this.workers.size >= MAX_WORKERS) {
      throw new Error(`Maximum worker count reached (${MAX_WORKERS}). Wait for an existing worker to finish first.`);
    }

    const workerId = `worker-${this.workers.size}`;
    const startedAt = Date.now();
    const state: WorkerState = {
      id: workerId,
      name: input.name,
      providerAlias: input.providerAlias,
      model: "",
      task: input.task,
      status: "pending",
      latestMessage: "Waiting to start...",
      transcript: [],
      startedAt,
      lastProgressAt: startedAt,
    };

    this.workers.set(workerId, state);
    this.bus.register(workerId);
    this.opts.onWorkerUpdate({ ...state });
    if (this.opts.backgroundTasks) {
      await this.opts.backgroundTasks.registerBackgroundTask({
        id: workerId,
        taskType: "local_agent",
        status: "pending",
        description: input.name,
        command: input.task,
        prompt: input.task,
        output: "",
      });
    }

    void this.runWorker(workerId, input);

    return {
      summary: `Worker "${input.name}" (${workerId}) spawned`,
      content: JSON.stringify({ worker_id: workerId, name: input.name, status: "pending" }),
    };
  }

  private async runWorker(workerId: string, input: SpawnAgentInput): Promise<void> {
    const update = (patch: Partial<WorkerState>) => {
      const current = this.workers.get(workerId);
      if (!current) {
        return;
      }
      Object.assign(current, patch);
      this.opts.onWorkerUpdate({ ...current });
      if (this.opts.backgroundTasks) {
        void this.opts.backgroundTasks.updateBackgroundTask(workerId, {
          status:
            current.status === "done"
              ? "completed"
              : current.status === "error" || current.status === "timeout"
                ? "failed"
                : current.status,
          description: current.name,
          command: current.task,
          error: current.error,
          ...(current.latestMessage ? { output: current.latestMessage } : {}),
        });
      }
    };

    const appendTranscript = (entry: WorkerState["transcript"][number]) => {
      const current = this.workers.get(workerId);
      if (!current) {
        return;
      }
      update({ transcript: [...current.transcript, entry] });
    };

    const touchProgress = (patch: Partial<WorkerState> = {}) => {
      update({ lastProgressAt: Date.now(), ...patch });
    };

    const abort = new AbortController();
    this.workerAborts.set(workerId, abort);
    update({ lastProgressAt: Date.now() });

    const idleCheckHandle = setInterval(() => {
      const state = this.workers.get(workerId);
      if (
        !state ||
        abort.signal.aborted ||
        state.status === "done" ||
        state.status === "error" ||
        state.status === "timeout"
      ) {
        clearInterval(idleCheckHandle);
        return;
      }

      const now = Date.now();
      if (now - state.lastProgressAt > WORKER_IDLE_TIMEOUT_MS) {
        abort.abort();
        update({
          status: "timeout",
          error: `无进展超时（${WORKER_IDLE_TIMEOUT_MS / 1000}s 内无 token / 工具调用）`,
          finishedAt: now,
        });
        this.bus.unregister(workerId);
        clearInterval(idleCheckHandle);
        return;
      }

      if (now - state.startedAt > WORKER_HARD_TIMEOUT_MS) {
        abort.abort();
        update({
          status: "timeout",
          error: `超过绝对时限（${WORKER_HARD_TIMEOUT_MS / 1000}s）`,
          finishedAt: now,
        });
        this.bus.unregister(workerId);
        clearInterval(idleCheckHandle);
      }
    }, 10_000);

    try {
      update({
        status: "running",
        latestMessage: "正在初始化...",
        lastProgressAt: Date.now(),
      });

      const workerSystemPrompt =
        `You are a focused Worker Agent named "${input.name}", running as part of a parallel team coordinated by a Coordinator.\n\n` +
        `# Your role\n` +
        `You execute a single, well-scoped sub-task assigned by the Coordinator. Complete your task fully — don't gold-plate, but don't leave it half-done. ` +
        `When you finish, respond with a concise report covering what was done and any key findings — the Coordinator will relay this to the user.\n\n` +
        `# Communication rules\n` +
        ` - To report your result or send intermediate status, you MUST call send_message with to="coordinator".\n` +
        ` - Just writing text is NOT visible to the Coordinator or other Workers — you MUST use send_message.\n` +
        ` - Only broadcast to "*" (all Workers) in rare cases where a coordination issue affects the whole team.\n` +
        ` - Do NOT spawn sub-Workers. You are a leaf node — execute directly.\n\n` +
        `# Coordination constraints\n` +
        ` - Do NOT modify the same file as another Worker simultaneously. If you need a file another Worker is editing, wait and check via send_message.\n` +
        ` - Do NOT trigger user approval dialogs (file writes, destructive commands) at the same time as other Workers. Stagger approval-requiring operations.\n` +
        ` - You cannot use EnterPlanMode, RunVerification, VerifyPlanExecution, or RunReview. Leave those to the Coordinator.\n\n` +
        `# Available tools\n` +
        ` - File operations: read_file, write_file, replace_in_file, list_files, glob_files, search_files\n` +
        ` - Command execution: run_command (allowlisted only — git add/commit/push/stash, npm run/test/install, npx tsc)\n` +
        ` - Network: fetch_url\n` +
        ` - Task tracking: TaskCreate, TaskGet, TaskList, TaskUpdate\n` +
        ` - Communication: send_message\n\n` +
        `IMPORTANT: run_command only supports allowlisted commands. Some allowlisted commands have side effects ` +
        `(git add / git commit -m / git push / npm install) and may require user approval before they execute.\n\n` +
        WORKER_SYSTEM_PROMPT_BASE;

      const provider = await this.opts.resolveWorkerProvider(input.providerAlias, workerSystemPrompt);

      const sendMessageDef = this.getSwarmToolDefinitions().find(tool => tool.name === "send_message");
      if (!sendMessageDef) {
        throw new Error("Swarm send_message tool definition is missing.");
      }

      const workerTools = [
        ...toolDefinitions.filter(tool => WORKER_ALLOWED_TOOLS.has(tool.name)),
        sendMessageDef,
      ];
      const toolsPayload = getOpenAIToolsPayload(workerTools);

      const messages: NormalizedMessage[] = [
        { role: "user", content: input.task },
      ];

      const maxTurns = input.maxTurns ?? 20;
      let turns = 0;

      while (turns < maxTurns && !abort.signal.aborted) {
        turns++;

        const inbox = this.bus.drain(workerId);
        for (const msg of inbox) {
          const content = `[来自 ${msg.from}]: ${msg.content}`;
          messages.push({ role: "user", content });
          appendTranscript({ role: "user", content });
        }

        const step = await provider.runStep(messages, toolsPayload, token => {
          touchProgress({ latestMessage: token.slice(0, 120) });
        });

        messages.push({
          role: "assistant",
          content: step.text || "",
          ...(step.toolCalls.length > 0 ? { toolCalls: step.toolCalls } : {}),
        });

        if (step.text) {
          touchProgress({ latestMessage: step.text.slice(0, 120) });
          appendTranscript({ role: "assistant", content: step.text });
        }

        if (step.done) {
          break;
        }

        for (const toolCall of step.toolCalls) {
          touchProgress();

          if (toolCall.name === "send_message") {
            const sendInput = toolCall.input as SendMessageInput;
            this.bus.send({
              from: workerId,
              to: sendInput.to,
              content: sendInput.content,
              timestamp: Date.now(),
            });
            messages.push({
              role: "tool_result",
              toolCallId: toolCall.id,
              content: `消息已发送给 ${sendInput.to}`,
            });
            touchProgress();
            continue;
          }

          if (!WORKER_ALLOWED_TOOLS.has(toolCall.name)) {
            const errMsg = `Worker 无权使用工具 "${toolCall.name}"（不在 Worker 白名单内）`;
            messages.push({ role: "tool_result", toolCallId: toolCall.id, content: errMsg, isError: true });
            continue;
          }

          try {
            const result = await executeTool(toolCall.name, toolCall.input, this.opts.workerToolContext);
            messages.push({
              role: "tool_result",
              toolCallId: toolCall.id,
              content: `${result.summary}\n\n${result.content}`,
            });
            touchProgress();
            appendTranscript({ role: "tool", content: `${toolCall.name}: ${result.summary}` });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            messages.push({
              role: "tool_result",
              toolCallId: toolCall.id,
              content: `Tool error: ${msg}`,
              isError: true,
            });
            touchProgress();
          }
        }
      }

      if (!abort.signal.aborted) {
        const finalText = messages.filter(message => message.role === "assistant").at(-1)?.content ?? "";
        update({
          status: "done",
          latestMessage: finalText.slice(0, 120),
          finishedAt: Date.now(),
          lastProgressAt: Date.now(),
        });
        this.bus.send({
          from: workerId,
          to: "coordinator",
          content: `[${input.name} 完成] ${finalText}`,
          timestamp: Date.now(),
        });
        if (this.opts.backgroundTasks) {
          const finalText = messages.filter(message => message.role === "assistant").at(-1)?.content ?? "";
          await this.opts.backgroundTasks.updateBackgroundTask(workerId, {
            status: "completed",
            result: finalText,
            output: finalText,
            error: undefined,
          });
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        update({ status: "error", error: msg, finishedAt: Date.now() });
        this.bus.send({
          from: workerId,
          to: "coordinator",
          content: `[${input.name} 出错] ${msg}`,
          timestamp: Date.now(),
        });
      }
      if (!abort.signal.aborted && this.opts.backgroundTasks) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.opts.backgroundTasks.updateBackgroundTask(workerId, {
          status: "failed",
          error: msg,
          result: msg,
          output: msg,
        });
      }
    } finally {
      clearInterval(idleCheckHandle);
      this.workerAborts.delete(workerId);
      this.bus.unregister(workerId);
    }
  }

  private sendMessage(input: SendMessageInput): { summary: string; content: string } {
    this.bus.send({ from: "coordinator", to: input.to, content: input.content, timestamp: Date.now() });
    return {
      summary: `消息已发送给 ${input.to}`,
      content: JSON.stringify({ success: true, to: input.to }),
    };
  }

  private async waitForAgents(input: WaitForAgentsInput): Promise<{ summary: string; content: string }> {
    const ids = typeof input.ids === "string"
      ? (input.ids as string).split(",").map(id => id.trim()).filter(Boolean)
      : (input.ids as string[]);
    const timeoutMs = input.timeoutMs ?? WAIT_DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const allDone = ids.every(id => {
        const worker = this.workers.get(id);
        return !worker || worker.status === "done" || worker.status === "error" || worker.status === "timeout";
      });

      if (allDone) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const inbox = this.bus.drain("coordinator");
    const results = ids.map(id => {
      const worker = this.workers.get(id);
      return worker
        ? { id, name: worker.name, status: worker.status, output: worker.latestMessage, error: worker.error }
        : { id, status: "not_found" };
    });

    const inboxSummary = inbox.length > 0
      ? "\n\n收到 Worker 消息:\n" + inbox.map(message => `[${message.from}]: ${message.content}`).join("\n")
      : "";

    return {
      summary: `等待完成：${results.map(result => `${result.id}(${result.status})`).join(", ")}`,
      content: JSON.stringify(results) + inboxSummary,
    };
  }

  drainCoordinatorInbox(): string | null {
    const messages = this.bus.drain("coordinator");
    if (messages.length === 0) {
      return null;
    }
    return messages.map(message => `[来自 ${message.from}]: ${message.content}`).join("\n");
  }
}
