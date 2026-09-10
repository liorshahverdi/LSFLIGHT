import { describe, it, expect } from "vitest";
import { TrainerAircraft, createTrainer } from "../src/aircraft/trainer.js";
import {
  vec3,
  quatFromEulerYxzDeg,
  quatRotate,
  quatMultiply,
  bodyAxes,
  quatToEulerYxzDeg,
} from "../src/physics/frames.js";

const DT = 1 / 60;

function spawnCruising(): TrainerAircraft {
  // Near-trim cruise: 58 m/s level velocity at 1000 m, 2° pitch.
  return createTrainer({
    pos: vec3(0, 1000, 0),
    att: quatFromEulerYxzDeg({ yaw: 0, pitch: 2.0, roll: 0 }),
    vel: vec3(0, 0, -58),
    fuelKg: 200,
  });
}

describe("Trainer aircraft integration (FLT-209)", () => {
  it.each([25, 58])("aileron gives usable bank at %s m/s and settles after release", (speed) => {
    for (const direction of [-1, 1]) {
      const ac = spawnCruising();
      ac.body.vel = vec3(0, 0, -speed);
      for (let i = 0; i < 60 * 3; i++) ac.step(DT, { aileron: direction });
      const bank = quatToEulerYxzDeg(ac.body.att).roll * direction;
      // Low-speed steering should reach a useful bank in a short held input;
      // cruise should remain manageable rather than roll straight into inversion.
      expect(bank).toBeGreaterThan(speed === 25 ? 25 : 45);
      expect(bank).toBeLessThan(65);
      for (let i = 0; i < 60 * 4; i++) ac.step(DT);
      expect(Math.abs(ac.body.angVel.z)).toBeLessThan(Math.PI / 180);
      expect(Math.abs(quatToEulerYxzDeg(ac.body.att).roll)).toBeLessThan(75);
      expect(ac.crashed).toBe(false);
    }
  });

  it("trimmed cruise holds altitude within ±60 m over 60 s with zero input", () => {
    const ac = spawnCruising();
    let minAlt = Infinity;
    let maxAlt = -Infinity;
    for (let i = 0; i < 3600; i++) {
      ac.step(DT);
      minAlt = Math.min(minAlt, ac.body.pos.y);
      maxAlt = Math.max(maxAlt, ac.body.pos.y);
    }
    expect(Number.isFinite(minAlt)).toBe(true);
    expect(minAlt).toBeGreaterThan(940);
    expect(maxAlt).toBeLessThan(1060);
    expect(Number.isFinite(ac.body.vel.y)).toBe(true);
    expect(ac.lastAirflow.airspeed).toBeGreaterThan(15); // still flying, not ballistic
  });

  it("full throttle climbs; idle throttle descends", () => {
    const climber = spawnCruising();
    for (let i = 0; i < 60 * 20; i++) {
      climber.step(DT, { throttle: 1 });
    }
    const descender = spawnCruising();
    for (let i = 0; i < 60 * 20; i++) {
      descender.step(DT, { throttle: 0.1 });
    }
    // Rate damping removes the old >50 m pitch transient. Test a sustained
    // throttle response, not altitude gained during an underdamped excursion.
    expect(climber.body.pos.y).toBeGreaterThan(1010);
    expect(climber.body.vel.y).toBeGreaterThan(0);
    expect(descender.body.pos.y).toBeLessThan(995);
    expect(descender.body.vel.y).toBeLessThan(0);
    const climbAt20 = climber.body.pos.y;
    const descentAt20 = descender.body.pos.y;
    for (let i = 0; i < 60 * 40; i++) {
      climber.step(DT, { throttle: 1 });
      descender.step(DT, { throttle: 0.1 });
      expect(climber.body.vel.y).toBeGreaterThan(0);
      expect(descender.body.vel.y).toBeLessThan(0);
    }
    expect((climber.body.pos.y - climbAt20) / 40).toBeGreaterThan(1);
    expect((descender.body.pos.y - descentAt20) / 40).toBeLessThan(-1);
    expect(descender.body.pos.y).toBeGreaterThan(500); // controlled glide
  });

  it("elevator input pitches the nose up, release returns toward trim", () => {
    const ac = spawnCruising();
    let peakPitchRate = 0;
    for (let i = 0; i < 60 * 2; i++) {
      ac.step(DT, { elevator: 0.5 });
      peakPitchRate = Math.max(peakPitchRate, ac.body.angVel.x);
    }
    expect(peakPitchRate).toBeGreaterThan(0.02); // ~1+ deg/s pitch response
    const releaseError = Math.abs(ac.lastAirflow.aoaDeg - ac.coeffs.trimAoADeg);
    for (let i = 0; i < 60 * 5; i++) ac.step(DT);
    // Release removes rotation and restores aerodynamic trim, not an attitude lock.
    expect(Math.abs(ac.body.angVel.x)).toBeLessThan(peakPitchRate * 0.1);
    expect(Math.abs(ac.lastAirflow.aoaDeg - ac.coeffs.trimAoADeg)).toBeLessThan(releaseError);
    expect(Math.abs(ac.lastAirflow.aoaDeg - ac.coeffs.trimAoADeg)).toBeLessThan(1);
  });

  it.each([25, 58])(
    "stalls from %s m/s and genuinely recovers with normal pitch/throttle controls",
    (speed) => {
      const ac = createTrainer({
        pos: vec3(0, 1000, 0),
        att: quatFromEulerYxzDeg({ yaw: 0, pitch: 2, roll: 0 }),
        vel: vec3(0, 0, -speed),
      });
      // Include both representative near-level slow flight and the original
      // cruise/full-up stress case; do not hide it by changing the starting state.
      let stallTime = 0;
      while (stallTime < 10 && ac.lastAirflow.aoaDeg < ac.coeffs.criticalAoAPositiveDeg) {
        ac.step(DT, { throttle: 0, elevator: 0.85 });
        stallTime += DT;
      }
      expect(stallTime).toBeLessThan(10);
      expect(ac.lastAirflow.aoaDeg).toBeGreaterThanOrEqual(ac.coeffs.criticalAoAPositiveDeg);
      expect(ac.lastAirflow.airspeed).toBeLessThan(45);
      expect(ac.crashed).toBe(false);
      const stallAltitude = ac.body.pos.y;
      let minAltitude = stallAltitude;

      // Script normal recovery: full power, lower nose, level off after forward
      // speed returns. FLT-1204 specifies controlled recovery within 25 seconds.
      // AoA=0 alone is NOT recovery: airflow reports zero during a tailslide.
      let recoveryTime = 0;
      while (recoveryTime < 25) {
        const forward = bodyAxes(ac.body.att).forward;
        const pitch = (Math.atan2(forward.y, -forward.z) * 180) / Math.PI;
        const targetPitch = ac.lastAirflow.velBody.z < -30 ? 2 : -5;
        const elevator = Math.max(
          -1,
          Math.min(1, 0.05 * (targetPitch - pitch) - (0.02 * ac.body.angVel.x * 180) / Math.PI),
        );
        ac.step(DT, { throttle: 1, elevator });
        recoveryTime += DT;
        minAltitude = Math.min(minAltitude, ac.body.pos.y);
        expect(Math.abs(pitch)).toBeLessThan(75);
        expect(ac.crashed).toBe(false);
        if (
          ac.lastAirflow.velBody.z < -40 &&
          Math.abs(ac.lastAirflow.aoaDeg) < 10 &&
          ac.body.vel.y > -5 &&
          Math.abs(pitch) < 20 &&
          Math.abs(ac.body.angVel.x) < 0.1
        )
          break;
      }
      expect(recoveryTime).toBeLessThan(25);
      expect(minAltitude).toBeLessThan(stallAltitude);
      expect(ac.lastAirflow.velBody.z).toBeLessThan(-40);
      expect(Math.abs(ac.lastAirflow.aoaDeg)).toBeLessThan(10);
      expect(ac.body.vel.y).toBeGreaterThan(-5);
      expect(ac.lastTouchdown).toBeNull();
      for (const value of Object.values(ac.body.pos)) expect(Number.isFinite(value)).toBe(true);
    },
  );

  it("is deterministic: identical runs produce identical final states", () => {
    const a = spawnCruising();
    const b = spawnCruising();
    for (let i = 0; i < 60 * 30; i++) {
      const cmd = { throttle: i < 600 ? 1 : 0.7, elevator: Math.sin(i / 50) * 0.3 };
      a.step(DT, cmd);
      b.step(DT, cmd);
    }
    expect(a.body.pos).toEqual(b.body.pos);
    expect(a.body.vel).toEqual(b.body.vel);
    expect(a.body.att).toEqual(b.body.att);
  });

  it("fuel burns during flight", () => {
    const ac = spawnCruising();
    const before = ac.engine.fuelKg;
    for (let i = 0; i < 60 * 10; i++) ac.step(DT, { throttle: 0.8 });
    expect(ac.engine.fuelKg).toBeLessThan(before);
  });
});

describe("Trainer force frames", () => {
  it("heading rotation gives the same trajectory rotated about world up", () => {
    const q = quatFromEulerYxzDeg({ yaw: 90, pitch: 0, roll: 0 });
    const a = spawnCruising();
    const b = createTrainer({
      pos: { ...a.body.pos },
      att: quatMultiply(q, a.body.att),
      vel: quatRotate(q, a.body.vel),
    });
    for (let i = 0; i < 600; i++) {
      a.step(DT);
      b.step(DT);
    }
    const pos = quatRotate(q, a.body.pos);
    const vel = quatRotate(q, a.body.vel);
    for (const axis of ["x", "y", "z"] as const) {
      expect(b.body.pos[axis]).toBeCloseTo(pos[axis], 7);
      expect(b.body.vel[axis]).toBeCloseTo(vel[axis], 7);
    }
  });

  it("positive bank tilts lift toward world left, not world up", () => {
    const level = createTrainer();
    const banked = createTrainer({ att: quatFromEulerYxzDeg({ yaw: 0, pitch: 0, roll: 60 }) });
    level.step(DT, { throttle: 0 });
    banked.step(DT, { throttle: 0 });
    const liftDelta = level.body.vel.y + 9.80665 * DT;
    expect(banked.body.vel.x).toBeCloseTo(-Math.sin(Math.PI / 3) * liftDelta, 7);
    expect(banked.body.vel.y + 9.80665 * DT).toBeCloseTo(0.5 * liftDelta, 7);
  });
});
