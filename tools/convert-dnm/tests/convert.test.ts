import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { convertDnm } from "../src/convert.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "fixtures", name), "utf8");

describe("convertDnm (FLT-303)", () => {
  it("extracts triangles with node transform and frame rotation applied", () => {
    const m = convertDnm(fixture("minimal.dnm")).mesh;
    console.log("DBG idx", JSON.stringify(m.indices), "nverts", m.positions.length / 3);
    expect(m.indices).toHaveLength(6);
    // Vertices stored flat xyz.
    expect(m.positions.length).toBe(4 * 3);

    // Node POS translates by (5, 0.5, 0).
    // Frame rotation: dnm (x,y,z) -> sim (-x,y,-z).
    // dnm v0 = (0,0,2) + pos(5,.5,0) = (5,.5,2) -> sim (-5,.5,-2)
    const v0 = [m.positions[0], m.positions[1], m.positions[2]];
    expect(v0[0]).toBeCloseTo(-5, 5);
    expect(v0[1]).toBeCloseTo(0.5, 5);
    expect(v0[2]).toBeCloseTo(-2, 5);
  });

  it("colors normalized to 0..1 per face", () => {
    const m = convertDnm(fixture("minimal.dnm")).mesh;
    expect(m.colors.length).toBe(4 * 3);
    expect(m.colors[0]).toBeCloseTo(200 / 255, 5);
    // All four vertices got the face color of the triangle that used them last;
    // both faces share the same color so every entry matches.
    for (const c of m.colors) expect(c).toBeGreaterThan(0);
  });

  it("winding is reversed along with the axis flip (normals stay outward)", () => {
    const m = convertDnm(fixture("minimal.dnm")).mesh;
    // First face was (1,3,2) in dnm -> becomes (1,3,2) reversed = (2,3,1)
    expect(m.indices.slice(0, 3)).toEqual([2, 3, 1]);
  });

  it("output is JSON-stable across runs", () => {
    expect(JSON.stringify(convertDnm(fixture("minimal.dnm")).mesh)).toBe(
      JSON.stringify(convertDnm(fixture("minimal.dnm")).mesh),
    );
  });
});
