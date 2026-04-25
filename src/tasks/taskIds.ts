import { randomBytes } from "node:crypto";

import type { BackgroundTaskType } from "./types";

const TASK_ID_PREFIXES: Record<BackgroundTaskType, string> = {
  local_bash: "b",
  local_agent: "a",
  built_in_agent: "a",
  remote_agent: "r",
};

const TASK_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function generateBackgroundTaskId(type: BackgroundTaskType): string {
  const bytes = randomBytes(8);
  let id = TASK_ID_PREFIXES[type] ?? "x";

  for (let index = 0; index < 8; index += 1) {
    id += TASK_ID_ALPHABET[bytes[index]! % TASK_ID_ALPHABET.length];
  }

  return id;
}
