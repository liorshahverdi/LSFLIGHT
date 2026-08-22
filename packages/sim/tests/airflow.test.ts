import { describe, it, expect } from "vitest";
import { computeAirflow, type AirflowState } from "../src/flightmodel/airflow.js";
import { vec3, quatFromEulerYxzDeg, quatIdentity } from "../src/physics/frames.js";

const DEG = Math.PI / 180;

describe("Airflow: relative wind, AoA, sideslip (FLT-203)", () => {
  it("straight-and-level flight along -Z gives aoa=0, slip=0", () => {
    const af = computeAirflow({
      pos: vec3(),
      att: quatIdentity(),
      vel: vec3(0, 0, -100),
      altM: 0,
      wind: vec3(),
    });
    expect(af.airspeed).toBeCloseTo(100, 9);
    expect(af.aoaDeg).toBeCloseTo(0, 6);
    expect(af.slipDeg).toBeCloseTo(0, 6);
  });

  it("nose above velocity vector yields POSITIVE AoA (+10 deg case)", () => {
    // Pitched up 10°, but velocity still horizontal -> velocity sits 10° below nose.
    const af = computeAirflow({
      pos: vec3(),
      att: quatFromEulerYxzDeg({ yaw: 0, pitch: 10, roll: 0 }),
      vel: vec3(0, 0, -100),
      altM: 0,
      wind: vec3(),
    });
    expect(af.aoaDeg).toBeCloseTo(10, 4);
  });

  it("velocity above the nose yields NEGATIVE AoA", () => {
    const af = computeAirflow({
      pos: vec3(),
      att: quatFromEulerYxzDeg({ yaw: 0, pitch: -10, roll: 0 }),
      vel: vec3(0, 0, -100),
      altM: 0,
      wind: vec3(),
    });
    expect(af.aoaDeg).toBeCloseTo(-10, 4);
  });

  it("lateral gust produces sideslip angle", () => {
    // Flying north (-Z) with wind pushing from the east (+X gust).
    const af = computeAirflow({
      pos: vec3(),
      att: quatIdentity(),
      vel: vec3(-20, 0, -100),
      altM: 0,
      wind: vec3(),
    });
    expect(af.slipDeg).toBeCloseTo(Math.atan2(20, 100) / DEG, 3);
  });

  it("headwind increases airspeed, tailwind decreases it", () => {
    const base = { pos: vec3(), att: quatIdentity(), vel: vec3(0, 0, -100), wind: vec3() };
    const head = computeAirflow({ ...base, altM: 0, wind: vec3(0, 0, 15) });
    const tail = computeAirflow({ ...base, altM: 0, wind: vec3(0, 0, -15) });
    expect(head.airspeed).toBeCloseTo(115, 6);
    expect(tail.airspeed).toBeCloseTo(85, 6);
  });

  it("exposes Mach number from altitude-dependent speed of sound", () => {
    const af = computeAirflow({
      pos: vec3(),
      att: quatIdentity(),
      vel: vec3(0, 0, -340.29),
      altM: 0,
      wind: vec3(),
    });
    expect(af.mach).toBeCloseTo(1.0, 3);
  });

  it("vertical velocity contributes to AoA (climbing through still air reduces AoA)", () => {
    const af = computeAirflow({
      pos: vec3(),
      att: quatIdentity(), // nose level
      vel: vec3(0, 17.63, -100), // ~10° climb
      altM: 0,
      wind: vec3(),
    });
    expect(af.aoaDeg).toBeCloseTo(-10, 2);
  });

  it("returns a fully populated AirflowState shape", () => {
    const af = computeAirflow({
      pos: vec3(),
      att: quatIdentity(),
      vel: vec3(1, 2, -30),
      altM: 5000,
      wind: vec3(),
    }) as AirflowState;
    for (const key of ["airspeed", "aoaDeg", "slipDeg", "mach"] as const) {
      expect(Number.isFinite(af[key])).toBe(true);
    }
  });
});
