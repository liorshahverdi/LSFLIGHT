import { describe, it, expect } from "vitest";
import { SimRng } from "../src/random/rng.js";

describe("SimRng (FLT-104)", () => {
  it("is reproducible: same seed yields identical sequences", () => {
    const a = new SimRng(12345);
    const b = new SimRng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = new SimRng(1);
    const b = new SimRng(2);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("produces floats in [0,1)", () => {
    const rng = new SimRng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range and int helpers stay within bounds and are seed-reproducible", () => {
    const a = new SimRng(7);
    const b = new SimRng(7);
    for (let i = 0; i < 500; i++) {
      const f = a.range(-2, 5);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(5);
      const n = a.int(0, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(10);
    }
    // Reproducibility must hold after identical consumption patterns.
    const c = new SimRng(7);
    const d = new SimRng(7);
    for (let i = 0; i < 500; i++) {
      void c.range(-2, 5);
      void c.int(0, 10);
      void d.range(-2, 5);
      void d.int(0, 10);
    }
    const seqC = Array.from({ length: 20 }, () => c.range(-2, 5));
    const seqD = Array.from({ length: 20 }, () => d.range(-2, 5));
    expect(seqC).toEqual(seqD);
  });
});
