import { describe, it, expect } from "vitest";
import { SimClock } from "../src/core/clock.js";

describe("SimClock (FLT-101)", () => {
  it("advances exactly one fixed step per call", () => {
    const clock = new SimClock(1 / 60);
    clock.step();
    expect(clock.tick).toBe(1);
    expect(clock.time).toBeCloseTo(1 / 60, 12);
    clock.step();
    expect(clock.tick).toBe(2);
  });

  it("accumulator converts variable frame time into whole fixed steps", () => {
    const clock = new SimClock(1 / 60);
    const n = clock.advance(0.5); // half a second of wall time
    expect(n).toBe(30);
    expect(clock.tick).toBe(30);
    // leftover fractional time is carried, never injected as a partial step
    expect(clock.time).toBeCloseTo(n * (1 / 60), 12);
  });

  it("carries leftover time across frames without losing steps", () => {
    const clock = new SimClock(1 / 60);
    let steps = 0;
    steps += clock.advance(1 / 120); // half a step
    steps += clock.advance(1 / 120); // completes the first step
    expect(steps).toBe(1);
    void clock;
  });

  it("never spiral-of-death: caps catch-up steps per frame", () => {
    const clock = new SimClock(1 / 60, { maxCatchUpSteps: 10 });
    const n = clock.advance(5.0); // would need 300 steps
    expect(n).toBe(10); // clamped
  });
});
