import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "./IProviderAdapter";
import type { ProviderConfig } from "./IProviderAdapter";
import type { ProviderRuntimeOptions } from "../../thinkingEffort/types";

export function getClaudeCliCommand(
  cliPath: string | undefined,
  platform = process.platform,
): string {
  return cliPath || (platform === "win32" ? "claude.cmd" : "claude");
}

export function buildClaudeCliPrompt(
  messages: NormalizedMessage[],
  systemPrompt: string,
): string {
  const conversation = messages
    .filter(message => message.role === "user" || message.role === "assistant")
    .map(message => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  return [
    systemPrompt ? `System instructions:\n${systemPrompt}` : "",
    conversation ? `Conversation:\n${conversation}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export class ClaudeCliAdapter implements IProviderAdapter {
  private readonly config: Extract<ProviderConfig, { type: "claude-cli" }>;
  private readonly workspacePath: string;
  private readonly envMap: Record<string, string>;
  private readonly systemPrompt: string;

  constructor(
    config: Extract<ProviderConfig, { type: "claude-cli" }>,
    workspacePath: string,
    envMap: Record<string, string>,
    systemPrompt = "",
    _runtimeOptions: ProviderRuntimeOptions = {},
  ) {
    this.config = config;
    this.workspacePath = workspacePath;
    this.envMap = envMap;
    this.systemPrompt = systemPrompt;
  }

  async runStep(
    messages: NormalizedMessage[],
    _tools: unknown[],
    onToken: (token: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<NormalizedStep> {
    const command = getClaudeCliCommand(this.config.cliPath);
    const prompt = buildClaudeCliPrompt(messages, this.systemPrompt);

    const sessionId = randomUUID();
    // A provider turn for KainClaw is text-only. Do not inherit the user's
    // Claude MCP configuration, which can start unrelated local servers.
    const args = ["--print", "--output-format", "text", "--strict-mcp-config", "--session-id", sessionId];
    const configuredModel = this.config.model?.trim();
    // Provider-qualified model IDs belong to API adapters. Claude CLI expects
    // its own aliases or model IDs and hangs on values such as
    // "anthropic/claude-sonnet-4.6", so let the logged-in CLI choose its default.
    if (configuredModel && !configuredModel.includes("/")) args.push("--model", configuredModel);
    // Claude Code 2.1.218 no longer consumes a plain text prompt from stdin
    // in print mode. Passing it as the final argument keeps the invocation
    // explicitly non-interactive.
    args.push(prompt);

    const child =
      process.platform === "win32"
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command, ...args], {
            cwd: this.workspacePath,
            env: { ...process.env, ...this.envMap },
            windowsHide: true,
          })
        : spawn(command, args, {
            cwd: this.workspacePath,
            env: { ...process.env, ...this.envMap },
            windowsHide: true,
          });

    const text = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const timeoutMs = this.config.timeoutMs ?? 900_000;

      const handle = setTimeout(() => {
        child.kill();
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", err => { clearTimeout(handle); reject(err); });
      abortSignal?.addEventListener("abort", () => {
        child.kill();
        clearTimeout(handle);
        reject(new Error("claude CLI request aborted"));
      }, { once: true });
      child.on("close", code => {
        clearTimeout(handle);
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `claude CLI exited with code ${code}`));
          return;
        }
        resolve(stdout.trim() || "[assistant returned no text]");
      });
    });

    onToken(text);
    return { text, toolCalls: [], done: true };
  }
}
