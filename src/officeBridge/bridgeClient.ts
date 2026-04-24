export const DEFAULT_LOCAL_BRIDGE_URL = "http://127.0.0.1:52358";

export type OfficeBridgeSource = "word-addin" | "excel-addin" | "ppt-addin";

export type OfficeBridgeSession = {
  source: OfficeBridgeSource;
  sessionId: string;
  authToken?: string;
};

export type OfficeBridgeConfig = {
  providerType: string;
  model: string;
  baseUrl?: string;
  licenseActive: boolean;
  proxyMode: boolean;
};

export type OfficeBridgeContextMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: string;
  timestamp: number;
};

export type OfficeBridgeContext = {
  sessionId: string;
  updatedAt?: number;
  messages: OfficeBridgeContextMessage[];
};

export type OfficeBridgeRegistration = OfficeBridgeSession & {
  addin?: {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    connectedAt: number;
  };
};

export type OfficeBridgeMessageInput = {
  role: "user" | "assistant";
  content: string;
  source?: OfficeBridgeSource;
  timestamp?: number;
};

export type OfficeBridgeProxyMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OfficeBridgeProxyRequest = {
  messages: OfficeBridgeProxyMessage[];
  stream?: boolean;
};

export type OfficeBridgeSseEvent = {
  event: string;
  data: unknown;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function buildOfficeBridgeHeaders(
  session: OfficeBridgeSession,
  contentType = false,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-KainClaw-Source": session.source,
  };

  if (session.authToken) {
    headers.Authorization = `Bearer ${session.authToken}`;
  }

  if (contentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export function toOfficeBridgeProxyMessages(
  context: OfficeBridgeContext,
): OfficeBridgeProxyMessage[] {
  return context.messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

export function consumeOfficeBridgeSseBuffer(buffer: string): {
  events: OfficeBridgeSseEvent[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const segments = normalized.split("\n\n");
  const remainder = segments.pop() ?? "";
  const events = segments
    .map(segment => parseOfficeBridgeSseEvent(segment))
    .filter((event): event is OfficeBridgeSseEvent => event !== null);

  return {
    events,
    remainder,
  };
}

function parseOfficeBridgeSseEvent(segment: string): OfficeBridgeSseEvent | null {
  const trimmed = segment.trim();
  if (!trimmed) {
    return null;
  }

  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of trimmed.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  const rawData = dataLines.join("\n");
  if (!rawData) {
    return null;
  }

  try {
    return {
      event: eventName,
      data: JSON.parse(rawData) as unknown,
    };
  } catch {
    return {
      event: eventName,
      data: rawData,
    };
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Local Bridge request failed: ${response.status}`);
  }

  return await response.json() as T;
}

export function createOfficeBridgeClient(options?: {
  baseUrl?: string;
  fetchFn?: FetchLike;
}) {
  const baseUrl = (options?.baseUrl ?? DEFAULT_LOCAL_BRIDGE_URL).replace(/\/+$/, "");
  const fetchFn = options?.fetchFn ?? fetch;

  return {
    async register(
      source: OfficeBridgeSource,
      signal?: AbortSignal,
    ): Promise<OfficeBridgeRegistration> {
      const response = await fetchFn(`${baseUrl}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source }),
        signal,
      });
      const payload = await parseJsonResponse<{
        sessionId: string;
        authToken?: string;
        addin?: OfficeBridgeRegistration["addin"];
      }>(response);

      return {
        source,
        sessionId: payload.sessionId,
        authToken: payload.authToken,
        addin: payload.addin,
      };
    },

    async fetchConfig(
      session: OfficeBridgeSession,
      signal?: AbortSignal,
    ): Promise<OfficeBridgeConfig> {
      const response = await fetchFn(`${baseUrl}/config`, {
        headers: buildOfficeBridgeHeaders(session),
        signal,
      });

      return await parseJsonResponse<OfficeBridgeConfig>(response);
    },

    async fetchContext(
      session: OfficeBridgeSession,
      signal?: AbortSignal,
    ): Promise<OfficeBridgeContext> {
      const response = await fetchFn(
        `${baseUrl}/session/${encodeURIComponent(session.sessionId)}/context`,
        {
          headers: buildOfficeBridgeHeaders(session),
          signal,
        },
      );

      return await parseJsonResponse<OfficeBridgeContext>(response);
    },

    async appendMessage(
      session: OfficeBridgeSession,
      message: OfficeBridgeMessageInput,
      signal?: AbortSignal,
    ): Promise<OfficeBridgeContextMessage> {
      const response = await fetchFn(
        `${baseUrl}/session/${encodeURIComponent(session.sessionId)}/message`,
        {
          method: "POST",
          headers: buildOfficeBridgeHeaders(session, true),
          body: JSON.stringify({
            ...message,
            source: message.source ?? session.source,
          }),
          signal,
        },
      );
      const payload = await parseJsonResponse<{
        ok: true;
        message: OfficeBridgeContextMessage;
      }>(response);

      return payload.message;
    },

    async *streamProxy(
      session: OfficeBridgeSession,
      request: OfficeBridgeProxyRequest,
      signal?: AbortSignal,
    ): AsyncGenerator<OfficeBridgeSseEvent> {
      const response = await fetchFn(`${baseUrl}/proxy`, {
        method: "POST",
        headers: buildOfficeBridgeHeaders(session, true),
        body: JSON.stringify({
          messages: request.messages,
          stream: request.stream !== false,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Local Bridge proxy request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = consumeOfficeBridgeSseBuffer(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          yield event;
        }
      }

      if (buffer.trim()) {
        const parsed = consumeOfficeBridgeSseBuffer(`${buffer}\n\n`);
        for (const event of parsed.events) {
          yield event;
        }
      }
    },
  };
}
