import { describe, expect, it } from "vitest";
import { WORKER_ALLOWED_TOOLS } from "./types";

describe("swarm types", () => {
  it("keeps the expected worker tool allowlist entries", () => {
    expect(WORKER_ALLOWED_TOOLS.has("read_file")).toBe(true);
    expect(WORKER_ALLOWED_TOOLS.has("write_file")).toBe(true);
    expect(WORKER_ALLOWED_TOOLS.has("replace_in_file")).toBe(true);
    expect(WORKER_ALLOWED_TOOLS.has("LSP")).toBe(true);
    expect(WORKER_ALLOWED_TOOLS.has("send_message")).toBe(true);
  });

  it("does not expose dangerous git-level controls through the worker allowlist", () => {
    expect(WORKER_ALLOWED_TOOLS.has("TaskStop")).toBe(false);
    expect(WORKER_ALLOWED_TOOLS.has("spawn_agent")).toBe(false);
    expect(WORKER_ALLOWED_TOOLS.has("ExitPlanMode")).toBe(false);
  });
});
