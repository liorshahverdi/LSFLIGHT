import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { convertDnm } from "../src/convert.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "fixtures", name), "utf8");

describe("convertDnm (FLT-303)", () => {
  it("extracts adjacent PCK chunks with node transform and frame rotation applied", () => {
    const m = convertDnm(fixture("minimal.dnm")).mesh;
    expect(m.indices).toHaveLength(9);
    // Vertices stored flat xyz.
    expect(m.positions.length).toBe(7 * 3);

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
    expect(m.colors.length).toBe(7 * 3);
    expect(m.colors[0]).toBeCloseTo(200 / 255, 5);
    // All four vertices got the face color of the triangle that used them last;
    // both faces share the same color so every entry matches.
    expect(m.colors.slice(12)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  });

  it("preserves winding under the orientation-preserving two-axis rotation", () => {
    const m = convertDnm(fixture("minimal.dnm")).mesh;
    expect(m.indices).toEqual([0, 2, 1, 0, 1, 3, 4, 5, 6]);
    // First face points up in both source and output (cross product Y > 0).
    const [a, b, c] = m.indices.map((i) => m.positions.slice(i * 3, i * 3 + 3));
    expect(
      (b![2]! - a![2]!) * (c![0]! - a![0]!) - (b![0]! - a![0]!) * (c![2]! - a![2]!),
    ).toBeGreaterThan(0);
  });

  it("rejects a face index outside its own packed chunk", () => {
    expect(() => convertDnm(fixture("minimal.dnm").replace("V 0 2 1", "V 0 4 1"))).toThrow(/index/);
  });

  it("output is JSON-stable across runs", () => {
    expect(JSON.stringify(convertDnm(fixture("minimal.dnm")).mesh)).toBe(
      JSON.stringify(convertDnm(fixture("minimal.dnm")).mesh),
    );
  });
});

it.each(["cessna172r", "a10"])("orients real %s SRF winding to its direction normal", (name) => {
  const source = fixture(`${name}-face.dnm`);
  const mesh = convertDnm(source).mesh;
  expect(mesh.indices).toEqual(name === "a10" ? [0, 2, 1] : [0, 1, 2]);
  const n = source
    .match(/^N (.+)$/m)![1]!
    .split(/\s+/)
    .map(Number)
    .slice(3);
  const [a, b, c] = mesh.indices.map((i) => mesh.positions.slice(i * 3, i * 3 + 3));
  const u = b!.map((x, i) => x - a![i]!);
  const v = c!.map((x, i) => x - a![i]!);
  const cross = [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  expect(cross[0]! * -n[0]! + cross[1]! * n[1]! + cross[2]! * -n[2]!).toBeGreaterThan(0);
});

it.each(["", "N 100 200 300 0 0 0"])(
  "keeps deterministic source order without a usable normal (%s)",
  (normal) => {
    const source = fixture("a10-face.dnm").replace(/^N .+$/m, normal);
    expect(convertDnm(source).mesh.indices).toEqual([0, 1, 2]);
  },
);

it("keeps source order for a degenerate polygon even with a direction normal", () => {
  const source = fixture("a10-face.dnm").replace("V 0 1 2", "V 0 0 0");
  expect(convertDnm(source).mesh.indices).toEqual([0, 0, 0]);
});
