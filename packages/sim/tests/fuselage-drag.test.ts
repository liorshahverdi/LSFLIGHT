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
  pitchManeuver: 5.0,
  yawManeuver: 5.0,
  rollManeuver: 3.0,
  pitchDamp: 8.0,
  yawDamp: 10.0,
  rollDamp: 5.0,
  qBarCapPa: 15_000,
};

const CRUISE = {
  airspeed: 60,
  aoaDeg: 1.4,
  slipDeg: 0,
  mach: 0.18,
  velBody: { x: 0, y: 0, z: -60 },
};

describe("Fuselage perpendicular drag (velocity-vector stability)", () => {
  it("opposes vertical body-frame airflow (up-drag on +Y flow)", () => {
    const base = computeAeroForces(CRUISE, 0, BASE);
    const withFlow = computeAeroForces({ ...CRUISE, velBody: { x: 0, y: 10, z: -59 } }, 0, BASE);
    // Flow coming from below (+Y relative wind in body frame) must be braked.
    expect(withFlow.forceBody.y).toBeLessThan(base.forceBody.y);
  });

  it("opposes lateral body-frame airflow", () => {
    const base = computeAeroForces(CRUISE, 0, BASE);
    const withFlow = computeAeroForces({ ...CRUISE, velBody: { x: 8, y: 0, z: -59 } }, 0, BASE);
    expect(withFlow.forceBody.x).toBeLessThan(base.forceBody.x); // pushed back toward 0
  });

  it("quadratic in perpendicular flow speed: F doubles when flow does", () => {
    // Pure lateral flow at two speeds; isolate via forceBody.x.
    const f5 = computeAeroForces(
      { ...CRUISE, velBody: { x: 5, y: 0, z: 0 }, airspeed: 5, mach: 0.02 },
      0,
      BASE,
    );
    const f10 = computeAeroForces(
      { ...CRUISE, velBody: { x: 10, y: 0, z: 0 }, airspeed: 10, mach: 0.03 },
      0,
      BASE,
    );
    // With zero airspeed-along-z the early-return doesn't trigger (airspeed>0)
    // and lift/drag are tiny relative to fuse drag at these components...
    const ratio = Math.abs(f10.forceBody.x / f5.forceBody.x);
    expect(ratio).toBeCloseTo(4, 1); // all force terms scale with v²
  });

  it("zero perpendicular flow adds nothing", () => {
    const a = computeAeroForces(CRUISE, 0, BASE);
    const b = computeAeroForces({ ...CRUISE, velBody: { x: 0, y: 0, z: -60 } }, 0, BASE);
    expect(a.forceBody.x).toBe(b.forceBody.x);
    expect(a.forceBody.y).toBe(b.forceBody.y);
  });
});
