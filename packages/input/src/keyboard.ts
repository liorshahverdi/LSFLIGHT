/**
 * Keyboard -> logical control axes (FLT-402).
 *
 * Keys are binary; this class turns them into smooth analog axes with
 * attack/release ramps, plus a persistent throttle value.
 *
 * Scheme (matches plan FLT-402):
 *   W/S  pitch (W = nose down, S = nose up)
 *   A/D  roll
 *   Q/E  yaw
 *   Shift/Ctrl  throttle up/down (persistent)
 */

export interface ControlAxes {
  elevator: number; // -1..1 (+ = nose up)
  aileron: number;
  rudder: number;
  throttle: number; // 0..1 persistent
}

export interface KeyStateSource {
  isDown(code: string): boolean;
}

const RAMP_RATE = 2.5; // axes reach full throw in 0.4 s
const THROTTLE_RATE = 0.5; // full range in 2 s

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class KeyboardAxes {
  private elevator = 0;
  private aileron = 0;
  private rudder = 0;
  private throttle = 0;

  constructor(
    private readonly keys: KeyStateSource,
    options?: { initialThrottle?: number },
  ) {
    if (options?.initialThrottle !== undefined) {
      this.throttle = clamp01(options.initialThrottle);
    }
  }

  /** Advance smoothing by dt and return the current axes. */
  sample(dt: number): ControlAxes {
    const approach = (cur: number, target: number): number => {
      const d = target - cur;
      const step = RAMP_RATE * dt;
      if (Math.abs(d) <= step) return target;
      return cur + Math.sign(d) * step;
    };

    const pitchTarget = (this.keys.isDown("KeyS") ? 1 : 0) + (this.keys.isDown("KeyW") ? -1 : 0);
    const rollTarget = (this.keys.isDown("KeyD") ? 1 : 0) + (this.keys.isDown("KeyA") ? -1 : 0);
    const yawTarget = (this.keys.isDown("KeyE") ? 1 : 0) + (this.keys.isDown("KeyQ") ? -1 : 0);

    this.elevator = approach(this.elevator, clamp1(pitchTarget));
    this.aileron = approach(this.aileron, clamp1(rollTarget));
    this.rudder = approach(this.rudder, clamp1(yawTarget));

    if (this.keys.isDown("ShiftLeft") || this.keys.isDown("ShiftRight")) {
      this.throttle = clamp01(this.throttle + THROTTLE_RATE * dt);
    }
    if (this.keys.isDown("ControlLeft") || this.keys.isDown("ControlRight")) {
      this.throttle = clamp01(this.throttle - THROTTLE_RATE * dt);
    }

    return {
      elevator: this.elevator,
      aileron: this.aileron,
      rudder: this.rudder,
      throttle: this.throttle,
    };
  }
}
