/**
 * Control surface state + rate limiting (FLT-207).
 *
 * Logical ControlInput targets (-1..1) are approached at a finite deflection
 * rate so surfaces cannot teleport — this is what makes control feel analog
 * and keeps torque application smooth.
 */

export interface ControlSurfaceState {
  elevator: number; // -1..1 (+ = nose up)
  aileron: number;
  rudder: number;
}

export interface SurfaceTarget {
  elevator?: number;
  aileron?: number;
  rudder?: number;
}

export const DEFAULT_SURFACE_RATE = 3.0; // full throw per second

export function createControlSurfaceState(options?: {
  ratePerSec?: number;
}): ControlSurfaceState & { ratePerSec: number } {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    ratePerSec: options?.ratePerSec ?? DEFAULT_SURFACE_RATE,
  };
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

function approach(current: number, target: number, rate: number, dt: number): number {
  const clampedTarget = clamp1(target);
  const delta = clampedTarget - current;
  const maxStep = rate * dt;
  if (Math.abs(delta) <= maxStep) return clampedTarget;
  return current + Math.sign(delta) * maxStep;
}

export function stepControlSurfaces(
  s: ControlSurfaceState & { ratePerSec?: number },
  target: SurfaceTarget,
  dt: number,
): void {
  const rate = s.ratePerSec ?? DEFAULT_SURFACE_RATE;
  s.elevator = approach(s.elevator, target.elevator ?? 0, rate, dt);
  s.aileron = approach(s.aileron, target.aileron ?? 0, rate, dt);
  s.rudder = approach(s.rudder, target.rudder ?? 0, rate, dt);
}
