import { describe, it, expect } from "vitest";
import { createLogger, RingBufferSink } from "../src/core/logging.js";

describe("Structured logging (FLT-005)", () => {
  it("emits records with required fields: level, system, message", () => {
    const sink = new RingBufferSink(10);
    const log = createLogger({ sink });
    log.info("core", "simulation started");
    const recs = sink.records();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      level: "info",
      system: "core",
      msg: "simulation started",
    });
  });

  it("supports optional entity/scenario context", () => {
    const sink = new RingBufferSink(10);
    const log = createLogger({ sink });
    log.warn("flightmodel", "stall onset", { entityId: 42, scenarioId: "intercept" });
    expect(sink.records()[0]).toMatchObject({
      level: "warn",
      system: "flightmodel",
      entityId: 42,
      scenarioId: "intercept",
    });
  });

  it("ring buffer keeps only the most recent N records", () => {
    const sink = new RingBufferSink(3);
    const log = createLogger({ sink });
    for (let i = 0; i < 10; i++) log.debug("test", `msg ${i}`);
    const recs = sink.records();
    expect(recs).toHaveLength(3);
    expect(recs[0]?.msg).toBe("msg 7");
    expect(recs[2]?.msg).toBe("msg 9");
  });

  it("records are frozen snapshots (later mutation cannot rewrite history)", () => {
    const sink = new RingBufferSink(10);
    const log = createLogger({ sink });
    const ctx = { entityId: 1 };
    log.info("core", "hello", ctx);
    ctx.entityId = 999;
    expect(sink.records()[0]?.entityId).toBe(1);
  });

  it("child loggers bind system name", () => {
    const sink = new RingBufferSink(10);
    const parent = createLogger({ sink });
    const log = parent.child("ai");
    log.error("dogfight state machine failure", { entityId: 7 });
    expect(sink.records()[0]).toMatchObject({
      level: "error",
      system: "ai",
      entityId: 7,
    });
  });
});
