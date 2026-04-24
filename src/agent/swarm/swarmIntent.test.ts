import { describe, expect, it } from "vitest";

import { hasExplicitSwarmIntent } from "./swarmIntent";

describe("hasExplicitSwarmIntent", () => {
  it("matches explicit worker requests", () => {
    expect(hasExplicitSwarmIntent("Please use two workers to inspect the repo in parallel.")).toBe(true);
    expect(hasExplicitSwarmIntent("请派两个worker分头分析这个项目")).toBe(true);
    expect(hasExplicitSwarmIntent("spawn_agent and wait_for_agents for this task")).toBe(true);
  });

  it("does not trigger on generic code references", () => {
    expect(hasExplicitSwarmIntent("分析一下 agentRunner.ts 的实现")).toBe(false);
    expect(hasExplicitSwarmIntent("Explain the worker queue implementation in this file.")).toBe(false);
    expect(hasExplicitSwarmIntent("E:\\dianjing 读一下这个目录所有文件，再结合这个项目，做一个深度分析报告")).toBe(false);
  });
});
