import { describe, it, expect } from "vitest";
import { HeightfieldTerrain, type HeightfieldGridData } from "../src/ground/heightfield.js";

// 2x2 blocks (3x3 nodes), 10 m spacing, a ridge rising toward +x.
function makeGrid(): HeightfieldGridData {
  return {
    nx: 2,
    nz: 2,
    xWidM: 10,
    zWidM: 10,
    origin: { x: 100, z: 200 },
    elevationsM: [
      0,
      5,
      10, // z=0 row
      2,
      7,
      12, // z=1 row
      4,
      9,
      14, // z=2 row
    ],
  };
}

describe("HeightfieldTerrain (FLT-601 sim provider)", () => {
  it("returns exact node elevations at grid points", () => {
    const t = new HeightfieldTerrain({ grids: [makeGrid()] });
    expect(t.heightAt(100, 200)).toBeCloseTo(0);
    expect(t.heightAt(110, 200)).toBeCloseTo(5);
    expect(t.heightAt(120, 220)).toBeCloseTo(14);
    expect(t.heightAt(110, 210)).toBeCloseTo(7);
  });

  it("interpolates linearly inside blocks", () => {
    const t = new HeightfieldTerrain({ grids: [makeGrid()] });
    // Midpoint of block (0,0): average of corners 0,5,2,7 = 3.5.
    expect(t.heightAt(105, 205)).toBeCloseTo(3.5);
    // On the diagonal edge fx+fz=1 both triangles agree.
    expect(t.heightAt(105, 200)).toBeCloseTo(2.5);
  });

  it("uses the fallback elevation outside every grid", () => {
    const t = new HeightfieldTerrain({
      grids: [makeGrid()],
      fallbackElevationM: -50,
    });
    expect(t.heightAt(0, 0)).toBeCloseTo(-50);
    expect(t.contains(0, 0)).toBe(false);
    expect(t.contains(105, 205)).toBe(true);
  });

  it("takes the highest grid where extents overlap", () => {
    const raised: HeightfieldGridData = {
      ...makeGrid(),
      elevationsM: makeGrid().elevationsM.map((y) => y + 20),
    };
    const t = new HeightfieldTerrain({ grids: [makeGrid(), raised] });
    expect(t.heightAt(105, 205)).toBeCloseTo(23.5);
  });

  it("computes surface normals tilted with the slope", () => {
    const t = new HeightfieldTerrain({ grids: [makeGrid()], fallbackElevationM: 0 });
    // Ground rises toward +x, so normals tilt toward -x but keep positive y.
    const n = t.normalAt(115, 215);
    expect(n.y).toBeGreaterThan(0.8); // 45%-ish slope keeps y dominant
    expect(n.x).toBeLessThan(-0.01);
  });

  it("reports PAVED inside configured runway rectangles", () => {
    const t = new HeightfieldTerrain({
      grids: [makeGrid()],
      pavedRects: [{ x: 105, z: 205, widthM: 4, lengthM: 8 }],
    });
    expect(t.surfaceAt(105, 205)).toBe("PAVED");
    expect(t.surfaceAt(120, 205)).toBe("GRASS");
  });

  it("matches converter sampleElevation semantics", () => {
    // Same interpolation contract as tools/convert-fld sampleElevation:
    // lower triangle (fx+fz<=1) uses (00,10,01).
    const t = new HeightfieldTerrain({ grids: [makeGrid()] });
    expect(t.heightAt(102, 203)).toBeCloseTo(0 + 5 * 0.2 + 2 * 0.3);
  });
});
