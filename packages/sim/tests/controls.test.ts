import { describe, it, expect } from "vitest";
import { createControlSurfaceState, stepControlSurfaces } from "../src/flightmodel/controls.js";

const DT = 1 / 60;

describe("Control surface rate limiting (FLT-207)", () => {
  it("starts centered", () => {
    const s = createControlSurfaceState();
    expect(s.elevator).toBe(0);
    expect(s.aileron).toBe(0);
    expect(s.rudder).toBe(0);
  });

  it("deflection moves toward target but no faster than the rate limit", () => {
    const s = createControlSurfaceState();
    stepControlSurfaces(s, { elevator: 1, aileron: 0, rudder: 0 }, DT);
    expect(s.elevator).toBeCloseTo(3 * DT, 9); // default rate 3.0 (full throw in 1/3 s)
    expect(s.elevator).toBeLessThan(1);
  });

  it("reaches full deflection in ~1/3 s and clamps there", () => {
    const s = createControlSurfaceState();
    for (let i = 0; i < 30; i++) {
      stepControlSurfaces(s, { elevator: 1, aileron: 1, rudder: 1 }, DT);
    }
    expect(s.elevator).toBeCloseTo(1, 5);
    expect(s.aileron).toBeCloseTo(1, 5);
    expect(s.rudder).toBeCloseTo(1, 5);
  });

  it("recentering takes the same time as deflecting (symmetric)", () => {
    const s = createControlSurfaceState({ ratePerSec: 6 });
    for (let i = 0; i < 10; i++) stepControlSurfaces(s, { elevator: 1 }, DT);
    for (let i = 0; i < 10; i++) stepControlSurfaces(s, { elevator: 0 }, DT);
    expect(Math.abs(s.elevator)).toBeLessThan(1e-9);
  });

  it("overshoot targets are clamped to [-1,1]", () => {
    const s = createControlSurfaceState();
    for (let i = 0; i < 100; i++) {
      stepControlSurfaces(s, { elevator: 7, rudder: -7 }, DT);
    }
    expect(s.elevator).toBe(1);
    expect(s.rudder).toBe(-1);
  });

  it("is deterministic given identical input sequences", () => {
    const run = () => {
      const s = createControlSurfaceState();
      const trace: number[] = [];
      for (let i = 0; i < 120; i++) {
        const target = Math.sin(i / 10);
        stepControlSurfaces(s, { elevator: target }, DT);
        trace.push(s.elevator);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });
});
