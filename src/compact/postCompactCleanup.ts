import { resetMicrocompactState } from "./microCompact";
import { clearSessionMemoryStore, clearTeamRegistry } from "../toolRuntime";

/**
 * Run cleanup of caches and tracking state after compaction.
 * Call this after both auto-compact and manual /compact.
 */
export function runPostCompactCleanup(): void {
  resetMicrocompactState();
  clearSessionMemoryStore();
  clearTeamRegistry();
}
