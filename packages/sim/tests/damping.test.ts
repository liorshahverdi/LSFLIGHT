import { describe, it, expect } from "vitest";
import { computeAeroForces, type AeroCoeffs } from "../src/flightmodel/coefficient.js";

const BASE: AeroCoeffs = {
  wingAreaM2: 16,
  clZeroAoADeg: -2,
  clSlopePerDeg: 0.09,
  criticalAoAPositiveDeg: 16,
  criticalAoANegativeDeg: -12,
  postStallClFraction: 0.4,
  stallFalloffDeg: 10,
  cd0: 0.025,
  inducedDragK: 0.04,
  pitchStab: 2.0,
  yawStab: 3.0,
  trimAoADeg: 0,
  pitchManeuver: 5.0,
  yawManeuver: 5.0,
  rollManeuver: 3.0,
  pitchDamp: 8.0,
  yawDamp: 10.0,
  rollDamp: 5.0,
  qBarCapPa: 15_000,
};

const CRUISE = { airspeed: 60, aoaDeg: 1.4, slipDeg: 0, mach: 0.18 };

describe("Aerodynamic damping (FLT-312 analog)", () => {
  it("pitch rate produces opposing damping torque", () => {
    const still = computeAeroForces(CRUISE, 0, BASE);
    const pitching = computeAeroForces(CRUISE, 0, BASE, {}, { pitchRateRadS: 0.5 });
    // Positive pitch rate -> negative (nose-down) additional torque.
    expect(pitching.torqueBody.x).toBeLessThan(still.torqueBody.x);
    const delta = still.torqueBody.x - pitching.torqueBody.x;
    expect(delta).toBeGreaterThan(0);
  });

  it("damping scales linearly with rate", () => {
    const base = computeAeroForces(CRUISE, 0, BASE);
    const half = computeAeroForces(CRUISE, 0, BASE, {}, { pitchRateRadS: 0.25 });
    const full = computeAeroForces(CRUISE, 0, BASE, {}, { pitchRateRadS: 0.5 });
    const dHalf = base.torqueBody.x - half.torqueBody.x;
    const dFull = base.torqueBody.x - full.torqueBody.x;
    expect(dFull / Math.max(dHalf, 1e-12)).toBeCloseTo(2, 5);
  });

  it("zero rate gives zero damping contribution", () => {
    const a = computeAeroForces(CRUISE, 0, BASE, {}, {});
    const b = computeAeroForces(
      CRUISE,
      0,
      BASE,
      {},
      {
        pitchRateRadS: 0,
        yawRateRadS: 0,
        rollRateRadS: 0,
      },
    );
    expect(a.torqueBody.x).toBe(b.torqueBody.x);
    expect(a.torqueBody.y).toBe(b.torqueBody.y);
  });

  it("stability restores TRIM AoA, not zero AoA (speed stability)", () => {
    const c = { ...BASE, trimAoADeg: 2 };
    const below = computeAeroForces({ airspeed: 60, aoaDeg: 0, slipDeg: 0, mach: 0.18 }, 0, c);
    const above = computeAeroForces({ airspeed: 60, aoaDeg: 4, slipDeg: 0, mach: 0.18 }, 0, c);
    // At exactly trim AoA there is no stabilizing moment (control torques are zero).
    expect(below.torqueBody.x).toBeGreaterThan(0); // nose-up to restore
    expect(above.torqueBody.x).toBeLessThan(0); // nose-down to restore
    expect(Math.abs(above.torqueBody.x)).toBeCloseTo(Math.abs(below.torqueBody.x), 3); // symmetric about trim
  });

  it("roll and yaw rates damp their own axes", () => {
    const r = computeAeroForces(CRUISE, 0, BASE, {}, { rollRateRadS: 1 });
    const y = computeAeroForces(CRUISE, 0, BASE, {}, { yawRateRadS: 1 });
    const base = computeAeroForces(CRUISE, 0, BASE);
    expect(r.torqueBody.z).toBeLessThan(base.torqueBody.z);
    expect(y.torqueBody.y).toBeLessThan(base.torqueBody.y);
  });
});
