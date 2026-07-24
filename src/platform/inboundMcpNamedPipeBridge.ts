import { randomUUID } from "node:crypto";
import net, { type Server, type Socket } from "node:net";
import {
  InboundMcpExecutionBroker,
  type InboundMcpGrant,
  type InboundMcpGrantResult,
} from "./inboundMcpExecutionBroker";

export const KAINCLAW_INBOUND_MCP_PIPE_PATH = "\\\\.\\pipe\\kainclaw-inbound-mcp-v1";

type BridgeMethod =
  | "register"
  | "request_grant"
  | "validate_grant"
  | "consume_grant"
  | "execute_chat"
  | "revoke_grant"
  | "close_session";

type BridgeRequest = { id: string; method: BridgeMethod; params?: Record<string, unknown> };
type BridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

export type InboundMcpBridgeGrantRequest = {
  toolName: string;
  sessionId: string;
  sessionLabel?: string;
  promptSummary: string;
};

export type InboundMcpBridgeChatRequest = {
  serverInstanceId: string;
  sessionId: string;
  prompt: string;
};

export type InboundMcpBridgeChatResult =
  | { ok: true; turnId: string; text: string }
  | { ok: false; error: "denied" | "expired" | "unavailable" | "provider_failed" | "invalid_prompt" };

export type InboundMcpNamedPipeHostOptions = {
  executeChat?: (request: InboundMcpBridgeChatRequest) => Promise<{ turnId: string; text: string }>;
  closeSession?: (serverInstanceId: string, sessionId: string) => void;
  disconnect?: (serverInstanceId: string) => void;
};

export class InboundMcpBridgeUnavailableError extends Error {
  constructor(message = "The KainClaw desktop inbound MCP bridge is unavailable.") {
    super(message);
    this.name = "InboundMcpBridgeUnavailableError";
  }
}

/**
 * Newline-delimited JSON bridge over a Windows named pipe. Node's net API has
 * no pipe-ACL option, so pipe access is not treated as execution authority;
 * every stateful operation still requires an Electron-owned grant.
 */
export class InboundMcpNamedPipeHost {
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();

  constructor(
    private readonly broker: InboundMcpExecutionBroker,
    private readonly pipePath = KAINCLAW_INBOUND_MCP_PIPE_PATH,
    private readonly options: InboundMcpNamedPipeHostOptions = {},
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    const server = net.createServer(socket => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.pipePath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }

  private handleConnection(socket: Socket): void {
    this.sockets.add(socket);
    let input = "";
    let connectionId: string | undefined;
    let serverInstanceId: string | undefined;
    socket.setEncoding("utf8");
    socket.on("data", chunk => {
      input += chunk;
      let lineEnd = input.indexOf("\n");
      while (lineEnd >= 0) {
        const line = input.slice(0, lineEnd);
        input = input.slice(lineEnd + 1);
        if (line.length > 32_000) {
          this.respond(socket, { id: "", ok: false, error: { code: "invalid_request", message: "Bridge request is too large." } });
        } else if (line.trim()) {
          void this.handleRequest(socket, line, () => connectionId, () => serverInstanceId, connection => {
            connectionId = connection.connectionId;
            serverInstanceId = connection.serverInstanceId;
          });
        }
        lineEnd = input.indexOf("\n");
      }
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      if (connectionId) this.broker.disconnect(connectionId);
      if (serverInstanceId) this.options.disconnect?.(serverInstanceId);
    });
    socket.on("error", () => {
      // A close event follows for normal pipe disconnects.
    });
  }

  private async handleRequest(
    socket: Socket,
    line: string,
    getConnectionId: () => string | undefined,
    getServerInstanceId: () => string | undefined,
    setConnection: (connection: { connectionId: string; serverInstanceId: string }) => void,
  ): Promise<void> {
    const parsed = parseBridgeRequest(line);
    if (!parsed.ok) {
      this.respond(socket, parsed.response);
      return;
    }
    const request = parsed.request;
    try {
      if (request.method === "register") {
        if (getConnectionId()) throw new Error("Bridge connection is already registered.");
        const serverInstanceId = requireString(request.params, "serverInstanceId");
        const connection = this.broker.register(serverInstanceId);
        setConnection(connection);
        this.respond(socket, { id: request.id, ok: true, result: connection });
        return;
      }
      const connectionId = getConnectionId();
      if (!connectionId) throw new Error("Bridge connection must register before requesting a grant.");
      if (request.method === "request_grant") {
        const result = await this.broker.requestGrant({
          connectionId,
          serverInstanceId: requireString(request.params, "serverInstanceId"),
          toolName: requireString(request.params, "toolName"),
          sessionId: requireString(request.params, "sessionId"),
          sessionLabel: optionalString(request.params, "sessionLabel"),
          promptSummary: requireString(request.params, "promptSummary"),
        });
        this.respond(socket, { id: request.id, ok: true, result });
        return;
      }
      if (request.method === "validate_grant" || request.method === "consume_grant") {
        const grantRequest = {
          connectionId,
          serverInstanceId: requireString(request.params, "serverInstanceId"),
          toolName: requireString(request.params, "toolName"),
          sessionId: requireString(request.params, "sessionId"),
          grantId: requireString(request.params, "grantId"),
        };
        const result = request.method === "consume_grant"
          ? this.broker.consumeGrant(grantRequest)
          : this.broker.validateGrant(grantRequest);
        this.respond(socket, { id: request.id, ok: true, result });
        return;
      }
      if (request.method === "revoke_grant") {
        this.respond(socket, { id: request.id, ok: true, result: { revoked: this.broker.revokeGrant(connectionId, requireString(request.params, "grantId")) } });
        return;
      }
      if (request.method === "execute_chat") {
        const serverInstanceId = getServerInstanceId();
        if (!serverInstanceId || !this.options.executeChat) {
          this.respond(socket, { id: request.id, ok: true, result: { ok: false, error: "unavailable" } satisfies InboundMcpBridgeChatResult });
          return;
        }
        const sessionId = requireString(request.params, "sessionId");
        const authorization = this.broker.consumeGrant({
          connectionId,
          serverInstanceId,
          toolName: "kainclaw_chat",
          sessionId,
          grantId: requireString(request.params, "grantId"),
        });
        if (!authorization.ok) {
          const error = authorization.reason === "denied" || authorization.reason === "expired"
            ? authorization.reason
            : "unavailable";
          this.respond(socket, { id: request.id, ok: true, result: { ok: false, error } satisfies InboundMcpBridgeChatResult });
          return;
        }
        try {
          const result = await this.options.executeChat({
            serverInstanceId,
            sessionId,
            prompt: requireString(request.params, "prompt"),
          });
          this.respond(socket, { id: request.id, ok: true, result: { ok: true, ...result } satisfies InboundMcpBridgeChatResult });
        } catch (error) {
          const code = error instanceof Error && error.name === "InboundMcpTextChatError" && error.message.includes("prompt")
            ? "invalid_prompt"
            : "provider_failed";
          this.respond(socket, { id: request.id, ok: true, result: { ok: false, error: code } satisfies InboundMcpBridgeChatResult });
        }
        return;
      }
      const sessionId = requireString(request.params, "sessionId");
      this.broker.closeInboundSession(connectionId, sessionId);
      const serverInstanceId = getServerInstanceId();
      if (serverInstanceId) this.options.closeSession?.(serverInstanceId, sessionId);
      this.respond(socket, { id: request.id, ok: true, result: { closed: true } });
    } catch (error) {
      this.respond(socket, {
        id: request.id,
        ok: false,
        error: { code: "invalid_request", message: error instanceof Error ? error.message : "Invalid bridge request." },
      });
    }
  }

  private respond(socket: Socket, response: BridgeResponse): void {
    if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
  }
}

export class InboundMcpNamedPipeClient {
  private socket: Socket | undefined;
  private input = "";
  private readonly pending = new Map<string, { resolve: (response: BridgeResponse) => void; reject: (error: Error) => void }>();
  private serverInstanceId: string | undefined;
  private connectionId: string | undefined;

  constructor(private readonly pipePath = KAINCLAW_INBOUND_MCP_PIPE_PATH) {}

  async connect(serverInstanceId: string = randomUUID()): Promise<{ connectionId: string; serverInstanceId: string }> {
    if (this.socket) throw new InboundMcpBridgeUnavailableError("The inbound MCP bridge client is already connected.");
    const socket = net.createConnection(this.pipePath);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        socket.off("connect", onConnect);
        reject(new InboundMcpBridgeUnavailableError(error.message));
      };
      const onConnect = () => {
        socket.off("error", onError);
        resolve();
      };
      socket.once("error", onError);
      socket.once("connect", onConnect);
    });
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", chunk => this.handleData(chunk.toString()));
    socket.on("close", () => this.failPending(new InboundMcpBridgeUnavailableError()));
    socket.on("error", error => this.failPending(new InboundMcpBridgeUnavailableError(error.message)));
    this.serverInstanceId = serverInstanceId;
    const response = await this.send("register", { serverInstanceId });
    const result = response as { connectionId: string; serverInstanceId: string };
    this.connectionId = result.connectionId;
    return result;
  }

  async requestGrant(request: InboundMcpBridgeGrantRequest): Promise<InboundMcpGrantResult> {
    return this.send("request_grant", { ...this.requireConnection(), ...request }) as Promise<InboundMcpGrantResult>;
  }

  async validateGrant(grantId: string, toolName: string, sessionId: string): Promise<InboundMcpGrantResult> {
    return this.send("validate_grant", { ...this.requireConnection(), grantId, toolName, sessionId }) as Promise<InboundMcpGrantResult>;
  }

  async consumeGrant(grantId: string, toolName: string, sessionId: string): Promise<InboundMcpGrantResult> {
    return this.send("consume_grant", { ...this.requireConnection(), grantId, toolName, sessionId }) as Promise<InboundMcpGrantResult>;
  }

  async revokeGrant(grantId: string): Promise<boolean> {
    const result = await this.send("revoke_grant", { ...this.requireConnection(), grantId }) as { revoked: boolean };
    return result.revoked;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.send("close_session", { ...this.requireConnection(), sessionId });
  }

  async executeChat(grantId: string, sessionId: string, prompt: string): Promise<InboundMcpBridgeChatResult> {
    return this.send("execute_chat", { ...this.requireConnection(), grantId, sessionId, prompt }) as Promise<InboundMcpBridgeChatResult>;
  }

  close(): void {
    this.socket?.end();
    this.failPending(new InboundMcpBridgeUnavailableError());
    this.socket = undefined;
    this.connectionId = undefined;
    this.serverInstanceId = undefined;
  }

  private requireConnection(): { serverInstanceId: string } {
    if (!this.socket || !this.connectionId || !this.serverInstanceId) {
      throw new InboundMcpBridgeUnavailableError();
    }
    return { serverInstanceId: this.serverInstanceId };
  }

  private send(method: BridgeMethod, params: Record<string, unknown>): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new InboundMcpBridgeUnavailableError());
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.write(`${JSON.stringify({ id, method, params } satisfies BridgeRequest)}\n`, error => {
        if (error) {
          this.pending.delete(id);
          reject(new InboundMcpBridgeUnavailableError(error.message));
        }
      });
    }).then(response => {
      const bridgeResponse = response as BridgeResponse;
      if (!bridgeResponse.ok) throw new InboundMcpBridgeUnavailableError(bridgeResponse.error.message);
      return bridgeResponse.result;
    });
  }

  private handleData(chunk: string): void {
    this.input += chunk;
    let lineEnd = this.input.indexOf("\n");
    while (lineEnd >= 0) {
      const line = this.input.slice(0, lineEnd);
      this.input = this.input.slice(lineEnd + 1);
      try {
        const response = JSON.parse(line) as BridgeResponse;
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        this.failPending(new InboundMcpBridgeUnavailableError("The inbound MCP bridge returned invalid JSON."));
      }
      lineEnd = this.input.indexOf("\n");
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function parseBridgeRequest(line: string): { ok: true; request: BridgeRequest } | { ok: false; response: BridgeResponse } {
  try {
    const parsed = JSON.parse(line) as Partial<BridgeRequest>;
    if (typeof parsed.id !== "string" || typeof parsed.method !== "string" || !isBridgeMethod(parsed.method)) {
      throw new Error("Bridge request requires an id and supported method.");
    }
    return { ok: true, request: { id: parsed.id, method: parsed.method, params: parsed.params } };
  } catch (error) {
    return {
      ok: false,
      response: { id: "", ok: false, error: { code: "invalid_request", message: error instanceof Error ? error.message : "Invalid bridge request." } },
    };
  }
}

function isBridgeMethod(value: string): value is BridgeMethod {
  return ["register", "request_grant", "validate_grant", "consume_grant", "execute_chat", "revoke_grant", "close_session"].includes(value);
}

function requireString(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Bridge request requires ${key}.`);
  return value;
}

function optionalString(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Bridge request ${key} must be a string.`);
  return value;
}
