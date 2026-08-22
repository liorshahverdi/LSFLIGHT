import { describe, it, expect } from "vitest";
import {
  liftCoefficient,
  computeAeroForces,
  type AeroCoeffs,
} from "../src/flightmodel/coefficient.js";
import { airDensity } from "../src/physics/atmosphere.js";

const TRAINER: AeroCoeffs = {
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
  qBarCapPa: 15_000,
};

const RHO0 = airDensity(0);

describe("Lift coefficient curve (FLT-204)", () => {
  it("is linear below the stall: CL = cl0 + slope * (aoa - cl0AoA)", () => {
    const cl = liftCoefficient(5, TRAINER);
    expect(cl).toBeCloseTo(0.09 * (5 + 2), 9);
  });

  it("peaks at the critical AoA then falls off (stall)", () => {
    const clCrit = liftCoefficient(TRAINER.criticalAoAPositiveDeg, TRAINER);
    const clStalled = liftCoefficient(TRAINER.criticalAoAPositiveDeg + 6, TRAINER);
    expect(clStalled).toBeLessThan(clCrit);
    // Falls toward postStallClFraction of peak.
    const clDeepStall = liftCoefficient(
      TRAINER.criticalAoAPositiveDeg + TRAINER.stallFalloffDeg,
      TRAINER,
    );
    expect(clDeepStall / clCrit).toBeCloseTo(TRAINER.postStallClFraction, 6);
  });

  it("mirrors for negative AoA with its own critical angle", () => {
    const cl = liftCoefficient(TRAINER.criticalAoANegativeDeg - 4, TRAINER);
    const clCrit = liftCoefficient(TRAINER.criticalAoANegativeDeg, TRAINER);
    expect(Math.abs(cl)).toBeLessThan(Math.abs(clCrit));
  });
});

describe("Aerodynamic forces (FLT-204)", () => {
  const cruise = {
    airspeed: 60,
    aoaDeg: 4.5,
    slipDeg: 0,
    mach: 0.18,
  };

  it("lift at trim AoA supports the aircraft weight", () => {
    // Required CL = W/(q*S) = 0.306 -> trim AoA = cl0 + CL/slope ~= 1.4 deg.
    const trim = { ...cruise, aoaDeg: 1.403 };
    const result = computeAeroForces(trim, 0, TRAINER);
    const weight = 1100 * 9.81;
    expect(result.liftN).toBeGreaterThan(weight * 0.98);
    expect(result.liftN).toBeLessThan(weight * 1.02);
    expect(result.dragN).toBeGreaterThan(0);
    expect(result.dragN).toBeLessThan(weight * 0.1); // L/D > 10 in cruise
  });

  it("drag opposes airflow and follows CD = cd0 + k*CL^2", () => {
    const { dragN } = computeAeroForces(cruise, 0, TRAINER);
    const qBar = 0.5 * RHO0 * 60 * 60;
    const cl = liftCoefficient(4.5, TRAINER);
    expect(dragN).toBeCloseTo(
      qBar * TRAINER.wingAreaM2 * (TRAINER.cd0 + TRAINER.inducedDragK * cl * cl),
      6,
    );
  });

  it("drag grows with CL^2 (induced drag punishes hard maneuvering)", () => {
    const gentle = computeAeroForces({ ...cruise, aoaDeg: 2 }, 0, TRAINER).dragN;
    const hard = computeAeroForces({ ...cruise, aoaDeg: 12 }, 0, TRAINER).dragN;
    expect(hard).toBeGreaterThan(gentle * 1.5);
  });

  it("stick release: positive AoA produces NOSE-DOWN restoring torque", () => {
    const { torqueBody } = computeAeroForces(cruise, 0, TRAINER);
    expect(torqueBody.x).toBeLessThan(0); // pitch axis: negative = nose down
  });

  it("stick release: positive slip produces restoring yaw toward the wind", () => {
    const { torqueBody } = computeAeroForces({ ...cruise, slipDeg: 5 }, 0, TRAINER);
    expect(torqueBody.y).toBeGreaterThan(0); // yaw toward reducing slip
  });

  it("control authority scales with dynamic pressure (2x speed -> ~4x torque)", () => {
    const slow = computeAeroForces({ ...cruise, airspeed: 30 }, 0, TRAINER, { elevator: 1 });
    const fast = computeAeroForces({ ...cruise, airspeed: 60 }, 0, TRAINER, { elevator: 1 });
    const ratio = fast.torqueBody.x / slow.torqueBody.x;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it("control authority is capped at high speed (no infinite hardover)", () => {
    const vFast = computeAeroForces({ ...cruise, airspeed: 200 }, 0, TRAINER, { elevator: 1 });
    const vFaster = computeAeroForces({ ...cruise, airspeed: 400 }, 0, TRAINER, { elevator: 1 });
    expect(vFaster.torqueBody.x / vFast.torqueBody.x).toBeCloseTo(1, 5);
  });

  it("zero airspeed produces zero force and torque (finite at rest)", () => {
    const { forceBody, torqueBody, dragN } = computeAeroForces(
      { airspeed: 0, aoaDeg: 0, slipDeg: 0, mach: 0 },
      0,
      TRAINER,
      { elevator: 1 },
    );
    expect(forceBody.y).toBe(0);
    expect(dragN).toBe(0);
    expect(torqueBody.x).toBe(0);
  });

  it("air density reduces forces at altitude", () => {
    const sea = computeAeroForces(cruise, 0, TRAINER);
    const high = computeAeroForces(cruise, 10_000, TRAINER);
    expect(high.forceBody.y).toBeLessThan(sea.forceBody.y * 0.5);
  });
});
