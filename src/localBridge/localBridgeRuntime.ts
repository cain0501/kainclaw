import http from "node:http";
import { randomUUID } from "node:crypto";
import type net from "node:net";
import type { NormalizedMessage } from "../agent/providers/IProviderAdapter";
import type {
  AddinStatus,
  BridgeProviderConfig,
  ILocalBridgeRuntime,
  LocalBridgeSessionContextHandler,
  LocalBridgeSessionMessageHandler,
  LocalBridgeProxyHandler,
  LocalBridgeProxyRequest,
  LocalBridgeOptions,
  LocalBridgeRuntimeStatus,
  RegisteredAddin,
} from "../platform/localBridgeRuntime";

const DEFAULT_PORT = 52358;
const DEFAULT_VERSION = "1.0";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+\.officeapps\.live\.com$/i,
  /^https?:\/\/[a-z0-9-]+\.office\.com$/i,
];

const DEFAULT_PROVIDER_CONFIG: BridgeProviderConfig = {
  providerType: "unconfigured",
  model: "",
  licenseActive: false,
  proxyMode: true,
};

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean);
}

export class LocalBridgeRuntime implements ILocalBridgeRuntime {
  private server: http.Server | null = null;
  private port: number = DEFAULT_PORT;
  private version = DEFAULT_VERSION;
  private authToken: string | undefined;
  private readonly addinStatusMap = new Map<string, AddinStatus>();
  private readonly addinRegisteredHandlers: Array<(addin: RegisteredAddin) => void> = [];
  private readonly statusChangedHandlers: Array<
    (status: LocalBridgeRuntimeStatus) => void
  > = [];
  private getProviderConfig: (() => BridgeProviderConfig) | undefined;
  private getSessionContext: LocalBridgeSessionContextHandler | undefined;
  private appendSessionMessage: LocalBridgeSessionMessageHandler | undefined;
  private handleProxyRequest: LocalBridgeProxyHandler | undefined;
  private resolveSessionId: (() => Promise<string> | string) | undefined;
  private sessionId: string | undefined;
  private lastError: string | undefined;

  async start(options?: LocalBridgeOptions): Promise<void> {
    if (this.server) {
      return;
    }

    const requestedPort = options?.port ?? DEFAULT_PORT;
    const version = options?.version?.trim();
    this.version = version || DEFAULT_VERSION;
    this.authToken = options?.authToken?.trim() || undefined;
    this.getProviderConfig = options?.getProviderConfig;
    this.getSessionContext = options?.getSessionContext;
    this.appendSessionMessage = options?.appendSessionMessage;
    this.handleProxyRequest = options?.handleProxyRequest;
    this.resolveSessionId = options?.resolveSessionId;
    this.lastError = undefined;

    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    server.on("clientError", (_error, socket) => {
      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
    });

    this.server = server;

    try {
      await new Promise<void>((resolve, reject) => {
        const handleError = (error: Error) => {
          server.off("listening", handleListening);
          reject(error);
        };
        const handleListening = () => {
          server.off("error", handleError);
          const addr = server.address() as net.AddressInfo;
          this.port = addr.port;
          resolve();
        };

        server.once("error", handleError);
        server.once("listening", handleListening);
        server.listen(requestedPort, "127.0.0.1");
      });
    } catch (error) {
      this.server = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatusChanged();
      throw error;
    }

    this.emitStatusChanged();
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    this.lastError = undefined;

    if (this.addinStatusMap.size > 0) {
      const disconnectedAt = Date.now();
      for (const [addinId, status] of this.addinStatusMap.entries()) {
        this.addinStatusMap.set(addinId, {
          ...status,
          connectionStatus: "disconnected",
          lastPingAt: status.lastPingAt ?? disconnectedAt,
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.emitStatusChanged();
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  getPort(): number {
    return this.port;
  }

  getStatus(): LocalBridgeRuntimeStatus {
    return {
      running: this.isRunning(),
      port: this.port,
      version: this.version,
      sessionId: this.sessionId,
      addins: [...this.addinStatusMap.values()].sort((left, right) =>
        left.addin.id.localeCompare(right.addin.id),
      ),
      error: this.lastError,
    };
  }

  getAddinStatus(addinId: string): AddinStatus | undefined {
    return this.addinStatusMap.get(addinId);
  }

  onAddinRegistered(handler: (addin: RegisteredAddin) => void): () => void {
    this.addinRegisteredHandlers.push(handler);
    return () => {
      const idx = this.addinRegisteredHandlers.indexOf(handler);
      if (idx !== -1) {
        this.addinRegisteredHandlers.splice(idx, 1);
      }
    };
  }

  onStatusChanged(
    handler: (status: LocalBridgeRuntimeStatus) => void,
  ): () => void {
    this.statusChangedHandlers.push(handler);
    return () => {
      const idx = this.statusChangedHandlers.indexOf(handler);
      if (idx !== -1) {
        this.statusChangedHandlers.splice(idx, 1);
      }
    };
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const origin = typeof req.headers.origin === "string"
      ? req.headers.origin.trim()
      : "";

    if (origin && !isAllowedOrigin(origin)) {
      this.writeJson(res, 403, { error: "Forbidden origin" });
      return;
    }

    this.applyCorsHeaders(res, origin);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/health" && req.method === "GET") {
      this.writeJson(res, 200, {
        status: "ok",
        version: this.version,
        port: this.port,
      });
      return;
    }

    if (req.url === "/config" && req.method === "GET") {
      const authResult = this.requireAuthorizedSource(req);
      if (!authResult.ok) {
        this.writeJson(res, authResult.statusCode, { error: authResult.error });
        return;
      }

      this.writeJson(
        res,
        200,
        this.getProviderConfig?.() ?? DEFAULT_PROVIDER_CONFIG,
      );
      return;
    }

    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/register" && req.method === "POST") {
      const parsedBody = await this.readJsonBody(req);
      if (!parsedBody.ok) {
        this.writeJson(res, 400, { error: parsedBody.error });
        return;
      }

      try {
        const addin = this.registerAddin(parsedBody.value);
        const sessionId = await this.ensureSessionId();
        this.writeJson(res, 200, {
          ok: true,
          addin,
          sessionId,
          authToken: this.authToken,
        });
      } catch (error) {
        this.writeJson(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (requestUrl.pathname === "/proxy" && req.method === "POST") {
      await this.handleProxyHttpRequest(req, res);
      return;
    }

    const sessionRoute = this.matchSessionRoute(requestUrl.pathname);
    if (sessionRoute && req.method === "GET" && sessionRoute.kind === "context") {
      await this.handleSessionContextRequest(sessionRoute.sessionId, req, res);
      return;
    }

    if (sessionRoute && req.method === "POST" && sessionRoute.kind === "message") {
      await this.handleSessionMessageRequest(sessionRoute.sessionId, req, res);
      return;
    }

    this.writeJson(res, 404, { error: "Not found" });
  }

  private applyCorsHeaders(
    res: http.ServerResponse,
    origin: string,
  ): void {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-KainClaw-Source",
    );
  }

  private writeJson(
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  private readJsonBody(
    req: http.IncomingMessage,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
    return new Promise(resolve => {
      let body = "";

      req.on("data", chunk => {
        body += chunk;
      });

      req.on("end", () => {
        if (!body.trim()) {
          resolve({ ok: true, value: {} });
          return;
        }

        try {
          resolve({ ok: true, value: JSON.parse(body) });
        } catch {
          resolve({ ok: false, error: "Invalid JSON body" });
        }
      });

      req.on("error", error => {
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  private async handleProxyHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const authResult = this.requireAuthorizedSource(req);
    if (!authResult.ok) {
      this.writeJson(res, authResult.statusCode, { error: authResult.error });
      return;
    }

    if (!this.handleProxyRequest) {
      this.writeJson(res, 503, { error: "Local bridge proxy is not configured" });
      return;
    }

    const parsedBody = await this.readJsonBody(req);
    if (!parsedBody.ok) {
      this.writeJson(res, 400, { error: parsedBody.error });
      return;
    }

    let request: LocalBridgeProxyRequest;
    try {
      request = this.parseProxyRequest(parsedBody.value);
    } catch (error) {
      this.writeJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const abortController = new AbortController();
    req.on("close", () => {
      abortController.abort();
    });

    if (request.stream === false) {
      try {
        const step = await this.handleProxyRequest(request, {
          onToken: () => {},
          abortSignal: abortController.signal,
        });
        this.writeJson(res, 200, { ok: true, step });
      } catch (error) {
        this.writeJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    this.writeSseEvent(res, "ready", { ok: true });

    try {
      const step = await this.handleProxyRequest(request, {
        onToken: token => {
          this.writeSseEvent(res, "token", { token });
        },
        abortSignal: abortController.signal,
      });
      this.writeSseEvent(res, "step", { step });
      this.writeSseEvent(res, "done", { ok: true });
    } catch (error) {
      this.writeSseEvent(res, "error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      res.end();
    }
  }

  private async handleSessionContextRequest(
    sessionId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const authResult = this.requireAuthorizedSource(req);
    if (!authResult.ok) {
      this.writeJson(res, authResult.statusCode, { error: authResult.error });
      return;
    }

    if (!this.getSessionContext) {
      this.writeJson(res, 503, {
        error: "Local bridge session context is not configured",
      });
      return;
    }

    try {
      const context = await this.getSessionContext(sessionId);
      this.writeJson(res, 200, context);
    } catch (error) {
      this.writeJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleSessionMessageRequest(
    sessionId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const authResult = this.requireAuthorizedSource(req);
    if (!authResult.ok) {
      this.writeJson(res, authResult.statusCode, { error: authResult.error });
      return;
    }

    if (!this.appendSessionMessage) {
      this.writeJson(res, 503, {
        error: "Local bridge session append is not configured",
      });
      return;
    }

    const parsedBody = await this.readJsonBody(req);
    if (!parsedBody.ok) {
      this.writeJson(res, 400, { error: parsedBody.error });
      return;
    }

    try {
      const messageInput = this.parseSessionMessageInput(parsedBody.value);
      if (authResult.source && messageInput.source !== authResult.source) {
        this.writeJson(res, 403, {
          error: "Session message source does not match authenticated source",
        });
        return;
      }

      const message = await this.appendSessionMessage({
        sessionId,
        message: messageInput,
      });
      this.writeJson(res, 200, { ok: true, message });
    } catch (error) {
      this.writeJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private matchSessionRoute(
    pathname: string,
  ): { sessionId: string; kind: "context" | "message" } | null {
    const match = /^\/session\/([^/]+)\/(context|message)$/.exec(pathname);
    if (!match) {
      return null;
    }

    const sessionId = decodeURIComponent(match[1] ?? "").trim();
    const kind = match[2] as "context" | "message";
    if (!sessionId) {
      return null;
    }

    return {
      sessionId,
      kind,
    };
  }

  private parseProxyRequest(payload: unknown): LocalBridgeProxyRequest {
    if (!isRecord(payload)) {
      throw new Error("Proxy body must be an object");
    }

    if (!Array.isArray(payload.messages)) {
      throw new Error("Proxy body must include a messages array");
    }

    return {
      messages: payload.messages.map(message => this.parseNormalizedMessage(message)),
      tools: Array.isArray(payload.tools) ? payload.tools : [],
      stream: payload.stream === false ? false : true,
    };
  }

  private parseSessionMessageInput(payload: unknown): {
    role: "user" | "assistant";
    content: string;
    source: string;
    timestamp?: number;
  } {
    if (!isRecord(payload)) {
      throw new Error("Session message body must be an object");
    }

    const role = payload.role === "assistant" ? "assistant" : payload.role === "user"
      ? "user"
      : undefined;
    if (!role) {
      throw new Error("Session message role must be 'user' or 'assistant'");
    }

    const content = this.readRequiredString(
      payload.content,
      "Session message content",
    );
    const source = this.readRequiredString(
      payload.source,
      "Session message source",
    );

    return {
      role,
      content,
      source,
      timestamp: typeof payload.timestamp === "number"
        ? payload.timestamp
        : undefined,
    };
  }

  private parseNormalizedMessage(payload: unknown): NormalizedMessage {
    if (!isRecord(payload) || typeof payload.role !== "string") {
      throw new Error("Each message must include a valid role");
    }

    if (payload.role === "user") {
      return {
        role: "user",
        content: this.readRequiredString(payload.content, "User message content"),
        attachments: Array.isArray(payload.attachments)
          ? payload.attachments
              .map(attachment => {
                if (!isRecord(attachment)) {
                  throw new Error("Attachment must be an object");
                }

                return {
                  data: this.readRequiredString(
                    attachment.data,
                    "Attachment data",
                  ),
                  mimeType: this.readRequiredString(
                    attachment.mimeType,
                    "Attachment mimeType",
                  ),
                };
              })
          : undefined,
      };
    }

    if (payload.role === "assistant") {
      return {
        role: "assistant",
        content: this.readRequiredString(
          payload.content,
          "Assistant message content",
        ),
        toolCalls: Array.isArray(payload.toolCalls)
          ? payload.toolCalls.map(toolCall => {
              if (!isRecord(toolCall)) {
                throw new Error("Tool call must be an object");
              }

              return {
                id: this.readRequiredString(toolCall.id, "Tool call id"),
                name: this.readRequiredString(toolCall.name, "Tool call name"),
                input: isRecord(toolCall.input) ? toolCall.input : {},
              };
            })
          : undefined,
      };
    }

    if (payload.role === "tool_result") {
      return {
        role: "tool_result",
        toolCallId: this.readRequiredString(
          payload.toolCallId,
          "Tool result toolCallId",
        ),
        content: this.readRequiredString(
          payload.content,
          "Tool result content",
        ),
        isError: payload.isError === true,
      };
    }

    throw new Error(`Unsupported message role: ${payload.role}`);
  }

  private readRequiredString(value: unknown, label: string): string {
    if (typeof value !== "string") {
      throw new Error(`${label} must be a string`);
    }

    return value;
  }

  private requireAuthorizedSource(
    req: http.IncomingMessage,
  ):
    | { ok: true; source: string }
    | { ok: false; statusCode: number; error: string } {
    const sourceHeader = this.readHeaderValue(req, "x-kainclaw-source");

    if (!this.authToken) {
      return {
        ok: true,
        source: sourceHeader ?? "",
      };
    }

    const authHeader = this.readHeaderValue(req, "authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : undefined;

    if (!token || token !== this.authToken) {
      return {
        ok: false,
        statusCode: 401,
        error: "Missing or invalid Local Bridge auth token",
      };
    }

    if (!sourceHeader) {
      return {
        ok: false,
        statusCode: 401,
        error: "Missing Local Bridge source header",
      };
    }

    const addinStatus = this.addinStatusMap.get(sourceHeader);
    if (!addinStatus || addinStatus.connectionStatus !== "connected") {
      return {
        ok: false,
        statusCode: 403,
        error: "Unregistered or disconnected Local Bridge source",
      };
    }

    return {
      ok: true,
      source: sourceHeader,
    };
  }

  private readHeaderValue(
    req: http.IncomingMessage,
    name: string,
  ): string | undefined {
    const value = req.headers[name];
    const normalized = Array.isArray(value) ? value[0] : value;
    const trimmed = normalized?.trim();
    return trimmed || undefined;
  }

  private writeSseEvent(
    res: http.ServerResponse,
    eventName: string,
    payload: unknown,
  ): void {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private registerAddin(payload: unknown): RegisteredAddin {
    if (!isRecord(payload)) {
      throw new Error("Register body must be an object");
    }

    const source = typeof payload.source === "string"
      ? payload.source.trim()
      : "";
    const id = typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : source;

    if (!id) {
      throw new Error("Missing add-in id");
    }

    const existing = this.addinStatusMap.get(id);
    const connectedAt = existing?.addin.connectedAt ?? Date.now();
    const addin: RegisteredAddin = {
      id,
      name: typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : source || id,
      version: typeof payload.version === "string" && payload.version.trim()
        ? payload.version.trim()
        : existing?.addin.version ?? "unknown",
      capabilities: toStringArray(payload.capabilities),
      connectedAt,
    };

    this.addinStatusMap.set(id, {
      addin,
      connectionStatus: "connected",
      lastPingAt: Date.now(),
    });

    this.emitAddinRegistered(addin);
    this.emitStatusChanged();

    return addin;
  }

  private async ensureSessionId(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const resolvedSessionId = this.resolveSessionId
      ? await this.resolveSessionId()
      : randomUUID();
    const normalizedSessionId = resolvedSessionId.trim();

    if (!normalizedSessionId) {
      throw new Error("Local bridge sessionId resolver returned an empty value");
    }

    this.sessionId = normalizedSessionId;
    this.emitStatusChanged();
    return normalizedSessionId;
  }

  private emitAddinRegistered(addin: RegisteredAddin): void {
    for (const handler of [...this.addinRegisteredHandlers]) {
      handler(addin);
    }
  }

  private emitStatusChanged(): void {
    const status = this.getStatus();
    for (const handler of [...this.statusChangedHandlers]) {
      handler(status);
    }
  }
}
