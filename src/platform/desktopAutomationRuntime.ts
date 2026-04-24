/**
 * Desktop automation capability surface.
 * Future implementation: src/computerUse/computerUseRuntime.ts
 * Consumers: Electron host, computer_use tool in toolRuntime
 */

export type ScreenshotResult = {
  base64: string;
  width: number;
  height: number;
};

export type DisplayMetrics = {
  width: number;
  height: number;
  scaleFactor: number;
};

export type ComputerAction =
  | { type: "screenshot" }
  | { type: "mouse_move"; x: number; y: number }
  | { type: "left_click"; x: number; y: number }
  | { type: "right_click"; x: number; y: number }
  | { type: "double_click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; x: number; y: number; direction: "up" | "down"; amount: number }
  | { type: "done"; result: string }
  | { type: "error"; message: string };

export type ComputerUseOptions = {
  maxIterations?: number;
  delayBetweenActionsMs?: number;
  onProgress?: (step: number, reasoning: string) => void;
};

export type ComputerUseResult = {
  success: boolean;
  result: string;
  steps: number;
};

export interface IDesktopAutomationRuntime {
  captureScreen(): Promise<ScreenshotResult>;
  getDisplayMetrics(): Promise<DisplayMetrics>;
  executeAction(action: ComputerAction): Promise<void>;
  runTask(task: string, options?: ComputerUseOptions): Promise<ComputerUseResult>;
}
