/**
 * Deterministic PRNG for the simulation (FLT-104).
 * Mulberry32 — small, fast, seedable. All simulation randomness MUST flow
 * through this class; Math.random() is forbidden in packages/sim.
 */
export class SimRng {
  private state: number;

  constructor(seed: number) {
    // Scramble the seed so small integer seeds still spread well.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
