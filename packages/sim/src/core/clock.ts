/**
 * Fixed-timestep simulation clock (FLT-101).
 *
 * The simulation advances ONLY in whole fixed steps. Hosts (rAF loop, CLI)
 * feed elapsed wall time into `advance()` which returns the number of whole
 * steps to run; fractional remainder is carried to the next frame.
 * `maxCatchUpSteps` (default: 1 simulated second) prevents a death-spiral after long pauses.
 */
export interface SimClockOptions {
  /** Maximum steps executed in a single advance() call (default 60 = 1 sim second). */
  maxCatchUpSteps?: number;
}

export class SimClock {
  readonly dt: number;
  private readonly maxCatchUpSteps: number;
  private _tick = 0;
  private _time = 0;
  private accumulator = 0;

  constructor(dt: number, options: SimClockOptions = {}) {
    if (!(dt > 0)) throw new Error(`SimClock dt must be > 0, got ${dt}`);
    this.dt = dt;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 60;
  }

  /** Number of fixed steps executed since construction. */
  get tick(): number {
    return this._tick;
  }

  /** Simulated time in seconds (= tick * dt). Exact multiple, no drift. */
  get time(): number {
    return this._tick * this.dt;
  }

  /** Run exactly one fixed step. Returns the new tick count. */
  step(): number {
    this._tick++;
    return this._tick;
  }

  /**
   * Convert elapsed seconds into whole fixed steps.
   * Returns how many times the host should call step().
   */
  advance(elapsedSeconds: number): number {
    this.accumulator += elapsedSeconds;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxCatchUpSteps) {
      this.accumulator -= this.dt;
      steps++;
    }
    // On clamp (spiral guard) drop stale time rather than exploding later.
    if (this.accumulator > this.dt * this.maxCatchUpSteps) {
      this.accumulator = 0;
    }
    this._tick += steps;
    return steps;
  }
}
