/**
 * Unified aggregate type for all Electron desktop runtime capabilities.
 * Pass this bundle via dependency injection rather than importing individual
 * runtimes directly into ElectronChatPanel or other consumers.
 */

import type { IDesktopAutomationRuntime } from "./desktopAutomationRuntime";
import type { IBrowserBridgeRuntime } from "./browserBridgeRuntime";
import type { ISchedulerRuntime } from "./schedulerRuntime";
import type { ILocalBridgeRuntime } from "./localBridgeRuntime";

export type DesktopRuntimeServices = {
  desktopAutomationRuntime?: IDesktopAutomationRuntime;
  browserBridgeRuntime?: IBrowserBridgeRuntime;
  schedulerRuntime?: ISchedulerRuntime;
  localBridgeRuntime?: ILocalBridgeRuntime;
};
