import type {
  NormalizedMessage,
  NormalizedStep,
  ProviderConfig,
} from "../agent/providers/IProviderAdapter";

/**
 * Local bridge server capability surface (Office Add-in ecosystem).
 * Future implementation: src/localBridge/localBridgeRuntime.ts
 * Consumers: ElectronChatPanel, office-addin-ecosystem spec, port 52358
 */

export type AddinConnectionStatus = "connected" | "disconnected" | "error";

export type RegisteredAddin = {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  connectedAt: number;
};

export type AddinStatus = {
  addin: RegisteredAddin;
  connectionStatus: AddinConnectionStatus;
  lastPingAt?: number;
};

export type BridgeProviderConfig = {
  providerType:
    | "anthropic"
    | "openai"
    | "openai-compatible"
    | "claude-cli"
    | "unconfigured";
  model: string;
  baseUrl?: string;
  licenseActive: boolean;
  proxyMode: boolean;
};

export type LocalBridgeRuntimeStatus = {
  running: boolean;
  port: number;
  version: string;
  sessionId?: string;
  addins: AddinStatus[];
  error?: string;
};

export type LocalBridgeSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: string;
  timestamp: number;
};

export type LocalBridgeSessionContext = {
  sessionId: string;
  messages: LocalBridgeSessionMessage[];
  updatedAt?: number;
};

export type LocalBridgeSessionMessageInput = {
  role: "user" | "assistant";
  content: string;
  source: string;
  timestamp?: number;
};

export type LocalBridgeProxyRequest = {
  messages: NormalizedMessage[];
  tools?: unknown[];
  stream?: boolean;
};

export type LocalBridgeProxyRuntimeContext = {
  config: ProviderConfig;
  workspaceRoot: string;
  envMap?: Record<string, string>;
  systemPrompt?: string;
};

export type LocalBridgeProxyHandler = (
  request: LocalBridgeProxyRequest,
  options: {
    onToken: (token: string) => void;
    abortSignal?: AbortSignal;
  },
) => Promise<NormalizedStep>;

export type LocalBridgeSessionContextHandler = (
  sessionId: string,
) => Promise<LocalBridgeSessionContext>;

export type LocalBridgeSessionMessageHandler = (request: {
  sessionId: string;
  message: LocalBridgeSessionMessageInput;
}) => Promise<LocalBridgeSessionMessage>;

export type LocalBridgeOptions = {
  port?: number;
  authToken?: string;
  version?: string;
  getProviderConfig?: () => BridgeProviderConfig;
  handleProxyRequest?: LocalBridgeProxyHandler;
  resolveSessionId?: () => Promise<string> | string;
  getSessionContext?: LocalBridgeSessionContextHandler;
  appendSessionMessage?: LocalBridgeSessionMessageHandler;
};

export interface ILocalBridgeRuntime {
  start(options?: LocalBridgeOptions): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getPort(): number;
  getStatus(): LocalBridgeRuntimeStatus;
  getAddinStatus(addinId: string): AddinStatus | undefined;
  onAddinRegistered(handler: (addin: RegisteredAddin) => void): () => void;
  onStatusChanged(
    handler: (status: LocalBridgeRuntimeStatus) => void,
  ): () => void;
}
