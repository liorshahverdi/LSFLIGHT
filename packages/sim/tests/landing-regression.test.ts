import { describe, it, expect } from "vitest";
import { createTrainer, type TrainerAircraft } from "../src/aircraft/trainer.js";
import { vec3, quatFromEulerYxzDeg } from "../src/physics/frames.js";

const DT = 1 / 60;
const GLIDE_ANGLE = (3 * Math.PI) / 180;

export interface LandingResult {
  ac: TrainerAircraft;
  touchedDown: boolean;
  stopped: boolean;
}

/**
 * Minimal glidepath controller for the landing regression (FLT-1205).
 * Tracks a 3-degree path with throttle at ~3 m/s sink, flares at 4 m AGL,
 * then brakes to a stop.
 */
export function flyLanding(): LandingResult {
  // Start exactly on the 3-degree path (gate 137 m at 2600 m range).
  const ac = createTrainer({
    pos: vec3(0, 100.7, 2000),
    att: quatFromEulerYxzDeg({ yaw: 0, pitch: -1, roll: 0 }),
    vel: vec3(0, -2.9, -55),
  });
  let throttle = 0.45;
  let touchedDown = false;
  let stopped = false;

  const AIM_Z = 100; // flare carries the aircraft toward runway center

  function pitchOf(q: { x: number; y: number; z: number; w: number }): number {
    return Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x + q.y * q.z)))) * 57.3;
  }

  for (let i = 0; i < 60 * 240 && !stopped; i++) {
    if (ac.crashed) break;
    const b = ac.body;

    if (!touchedDown) {
      const altAgl = b.pos.y - 1.09;
      const distToGo = Math.max(0, b.pos.z - AIM_Z);
      const glideAlt = distToGo * Math.tan(GLIDE_ANGLE) + 1.09;
      const altErr = altAgl - glideAlt;

      // Inner loop: hold pitch attitude; proportional flare below 5 m AGL.
      let pitchTarget = -1.0;
      if (altAgl < 5) {
        const flare = Math.max(0, Math.min(8, (1.2 - b.vel.y) * 1.5));
        pitchTarget = Math.max(-1.0, Math.min(flare, 8));
      }
      const pitch = pitchOf(b.att);
      const avxDeg = b.angVel.x * 57.3;
      const elevator = Math.max(
        -0.45,
        Math.min(0.45, 0.05 * (pitchTarget - pitch) - 0.02 * avxDeg),
      );

      // Outer loop: throttle chases the path.
      throttle = Math.max(0.12, Math.min(0.95, throttle - altErr * DT * 0.02));
      ac.step(DT, { throttle, elevator });
      // Use the simulation's actual gear-contact event, not body altitude:
      // the fuselage can be low while the wheels are still airborne.
      if (ac.lastTouchdown !== null) touchedDown = true;
    } else {
      ac.step(DT, { throttle: 0, brake: 1, elevator: 0 });
      if (Math.hypot(b.vel.x, b.vel.z) < 0.5) stopped = true;
    }
  }

  return { ac, touchedDown, stopped };
}

describe("Landing regression (FLT-1205)", () => {
  it("scripted approach touches down softly and stops on the runway", () => {
    const { ac, touchedDown, stopped } = flyLanding();
    expect(touchedDown).toBe(true);
    expect(ac.crashed).toBe(false);
    expect(ac.lastTouchdown!.rating).toBe("GOOD");
    expect(stopped).toBe(true);
    // Stopped within the runway footprint.
    expect(Math.abs(ac.body.pos.z)).toBeLessThan(700);
  });

  it("touchdown sink rate is gentle (< 3 m/s)", () => {
    const { ac, touchedDown } = flyLanding();
    expect(touchedDown).toBe(true);
    expect(Math.abs(ac.lastTouchdown!.sinkRate)).toBeLessThan(3);
  });
});
