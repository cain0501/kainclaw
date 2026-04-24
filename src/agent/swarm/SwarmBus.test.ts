import { describe, expect, it } from "vitest";
import { SwarmBus } from "./SwarmBus";

describe("SwarmBus", () => {
  it("delivers direct messages to the target inbox", () => {
    const bus = new SwarmBus();
    bus.register("coordinator");
    bus.register("worker-1");

    bus.send({
      from: "coordinator",
      to: "worker-1",
      content: "do the task",
      timestamp: 1,
    });

    expect(bus.drain("worker-1")).toEqual([
      {
        from: "coordinator",
        to: "worker-1",
        content: "do the task",
        timestamp: 1,
      },
    ]);
    expect(bus.drain("coordinator")).toEqual([]);
  });

  it("broadcasts to every registered agent except the sender", () => {
    const bus = new SwarmBus();
    bus.register("coordinator");
    bus.register("worker-1");
    bus.register("worker-2");

    bus.send({
      from: "coordinator",
      to: "*",
      content: "sync up",
      timestamp: 2,
    });

    expect(bus.drain("worker-1")).toHaveLength(1);
    expect(bus.drain("worker-2")).toHaveLength(1);
    expect(bus.drain("coordinator")).toEqual([]);
  });

  it("cleans up inboxes on unregister", () => {
    const bus = new SwarmBus();
    bus.register("worker-1");
    bus.unregister("worker-1");

    bus.send({
      from: "coordinator",
      to: "worker-1",
      content: "lost message",
      timestamp: 3,
    });

    expect(bus.registeredIds()).toEqual([]);
    expect(bus.drain("worker-1")).toEqual([]);
  });
});
