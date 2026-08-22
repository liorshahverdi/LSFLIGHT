import { describe, it, expect } from "vitest";
import { FlatTerrain } from "../src/ground/terrain.js";

describe("Flat terrain + runway query (FLT-501)", () => {
  const terrain = new FlatTerrain({
    runways: [
      {
        id: "27",
        // 45 m wide, 1200 m long strip centered at origin along -Z.
        center: { x: 0, z: 0 },
        widthM: 45,
        lengthM: 1200,
        headingDeg: 180,
      },
    ],
  });

  it("flat world: height is 0 everywhere", () => {
    expect(terrain.heightAt(0, 0)).toBe(0);
    expect(terrain.heightAt(1234.5, -9876)).toBe(0);
  });

  it("surface normal is up", () => {
    expect(terrain.normalAt(10, 10)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("runway rect is PAVED, elsewhere GRASS", () => {
    expect(terrain.surfaceAt(0, 0)).toBe("PAVED");
    expect(terrain.surfaceAt(20, -500)).toBe("PAVED"); // inside width
    expect(terrain.surfaceAt(30, -500)).toBe("GRASS"); // outside 45m halfwidth
    expect(terrain.surfaceAt(0, -550)).toBe("PAVED");
    expect(terrain.surfaceAt(0, -700)).toBe("GRASS"); // beyond length
  });
});
