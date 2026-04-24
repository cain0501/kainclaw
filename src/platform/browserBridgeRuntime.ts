/**
 * Browser bridge capability surface.
 * Future implementation: src/computerUse/browserBridgeRuntime.ts
 * Consumers: ElectronChatPanel (computer_use tool), browser extension via port 52357
 */

export type BridgeCommand =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "read"; selector: string }
  | { type: "evaluate"; script: string }
  | { type: "screenshot" }
  | { type: "scroll"; selector: string; direction: "up" | "down"; amount: number }
  | { type: "wait_for"; selector: string; timeoutMs?: number };

export type BridgeResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type BridgeStatus = {
  running: boolean;
  extensionConnected: boolean;
  port: number;
};

export interface IBrowserBridgeRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): BridgeStatus;
  execute(command: BridgeCommand, timeoutMs?: number): Promise<BridgeResult>;
}
