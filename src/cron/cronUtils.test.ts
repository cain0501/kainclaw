import { describe, expect, it } from "vitest";

import {
  cronToHuman,
  nextCronRunMs,
  parseCronExpression,
} from "./cronUtils";

describe("cronUtils", () => {
  it("parses valid cron expressions and rejects invalid ones", () => {
    expect(parseCronExpression("*/5 * * * *")?.minute.slice(0, 3)).toEqual([
      0,
      5,
      10,
    ]);
    expect(parseCronExpression("bad cron")).toBeNull();
    expect(parseCronExpression("* * *")).toBeNull();
  });

  it("computes a next run strictly after the anchor", () => {
    const from = new Date("2026-05-09T10:00:00").getTime();
    const next = nextCronRunMs("5 10 * * *", from);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(from);
  });

  it("renders common human-readable schedules", () => {
    expect(cronToHuman("*/5 * * * *")).toBe("Every 5 minutes");
    expect(cronToHuman("0 * * * *")).toBe("Every hour");
    expect(cronToHuman("30 14 * * *")).toContain("Every day at");
    expect(cronToHuman("30 14 * * 1")).toContain("Every Monday at");
    expect(cronToHuman("30 14 * * 1-5")).toContain("Weekdays at");
  });
});
