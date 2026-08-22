import { describe, it, expect } from "vitest";
import { TRAINER_AERO } from "../src/aircraft/trainer.js";
import { computeAeroForces } from "../src/flightmodel/coefficient.js";

/**
 * Guardrail: aerodynamic force must never do positive work along the
 * relative wind (that would create free energy / runaway flight).
 */
describe("Energy guardrail", () => {
  it("aero force does no positive work along the velocity vector", () => {
    for (const aoaDeg of [-8, -3, 0, 1.745, 5, 12, 20]) {
      const s = Math.sin((aoaDeg * Math.PI) / 180);
      const c = Math.cos((aoaDeg * Math.PI) / 180);
      const v = 80;
      const af = {
        airspeed: v,
        aoaDeg,
        slipDeg: 0,
        mach: 0.24,
        velBody: { x: 0, y: -s * v, z: -c * v },
      };
      const r = computeAeroForces(af, 1000, TRAINER_AERO);
      const dot =
        r.forceBody.x * af.velBody.x + r.forceBody.y * af.velBody.y + r.forceBody.z * af.velBody.z;
      expect(dot).toBeLessThanOrEqual(1e-6);
    }
  });

  it("lift is exactly perpendicular to the relative wind", () => {
    const aoaDeg = 4;
    const s = Math.sin((aoaDeg * Math.PI) / 180);
    const c = Math.cos((aoaDeg * Math.PI) / 180);
    const af = {
      airspeed: 70,
      aoaDeg,
      slipDeg: 0,
      mach: 0.21,
      velBody: { x: 0, y: -s * 70, z: -c * 70 },
    };
    const r = computeAeroForces(af, 1000, TRAINER_AERO);
    // Remove drag (parallel component) then dot the rest with velocity.
    const parallelMag =
      (r.forceBody.x * af.velBody.x) / 70 +
      (r.forceBody.y * af.velBody.y) / 70 +
      (r.forceBody.z * af.velBody.z) / 70;
    const perpX = r.forceBody.x - parallelMag * (af.velBody.x / 70);
    const perpY = r.forceBody.y - parallelMag * (af.velBody.y / 70);
    const perpZ = r.forceBody.z - parallelMag * (af.velBody.z / 70);
    const dotPerp = perpX * af.velBody.x + perpY * af.velBody.y + perpZ * af.velBody.z;
    expect(Math.abs(dotPerp)).toBeLessThan(1e-6 * 70 * r.liftN);
    // Perpendicular force = lift + fuselage perpendicular drag (small).
    const perpMag = Math.hypot(perpX, perpY, perpZ);
    expect(perpMag).toBeGreaterThanOrEqual(r.liftN);
    expect(perpMag).toBeLessThan(r.liftN * 1.05);
  });
});
