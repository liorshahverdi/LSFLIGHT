/**
 * Heightfield terrain provider (FLT-601 sim side).
 *
 * Backed by converted YSFlight .fld data (tools/convert-fld output):
 * one or more elevation grids placed in world space. Height queries use
 * the same triangle-split interpolation as the converter so sim and
 * rendering agree. Where grids overlap, the highest sample wins — this
 * mirrors YsScenery::GetElevation_Recursion.
 */
import type { SurfaceType, TerrainProvider } from "./terrain.js";

/** Subset of tools/convert-fld HeightfieldTerrain needed for queries. */
export interface HeightfieldGridData {
  nx: number;
  nz: number;
  xWidM: number;
  zWidM: number;
  origin: { x: number; z: number };
  elevationsM: number[];
}

export interface HeightfieldTerrainOptions {
  grids: HeightfieldGridData[];
  /** Elevation returned outside every grid (default 0 = sea level). */
  fallbackElevationM?: number;
  /** Paved rectangles: {x,z,widthM,lengthM} axis-aligned runways. */
  pavedRects?: { x: number; z: number; widthM: number; lengthM: number }[];
}

interface GridExt {
  g: HeightfieldGridData;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class HeightfieldTerrain implements TerrainProvider {
  private readonly exts: GridExt[];
  private readonly fallback: number;
  private readonly paved: { x: number; z: number; widthM: number; lengthM: number }[];

  constructor(options: HeightfieldTerrainOptions) {
    this.exts = options.grids.map((g) => ({
      g,
      minX: g.origin.x,
      minZ: g.origin.z,
      maxX: g.origin.x + g.nx * g.xWidM,
      maxZ: g.origin.z + g.nz * g.zWidM,
    }));
    // Highest-resolution/last-listed first is not required for correctness:
    // overlap resolution takes the max sampled elevation.
    this.fallback = options.fallbackElevationM ?? 0;
    this.paved = options.pavedRects ?? [];
  }

  /** True when any grid covers this point. */
  contains(x: number, z: number): boolean {
    return this.exts.some((e) => x >= e.minX && x <= e.maxX && z >= e.minZ && z <= e.maxZ);
  }

  /** Interpolated elevation of one grid at (x,z), or null when outside. */
  private sampleGrid(e: GridExt, x: number, z: number): number | null {
    const { g } = e;
    let bx = Math.floor((x - g.origin.x) / g.xWidM);
    let bz = Math.floor((z - g.origin.z) / g.zWidM);
    // Points exactly on the far edge belong to the last block.
    if (bx < 0 || bz < 0 || bx > g.nx || bz > g.nz) return null;
    if (bx === g.nx) {
      if (Math.abs(x - (g.origin.x + g.nx * g.xWidM)) > 1e-9) return null;
      bx = g.nx - 1;
    }
    if (bz === g.nz) {
      if (Math.abs(z - (g.origin.z + g.nz * g.zWidM)) > 1e-9) return null;
      bz = g.nz - 1;
    }

    const nx1 = g.nx + 1;
    const idx = (ix: number, iz: number): number => g.elevationsM[iz * nx1 + ix] ?? 0;
    const x0 = g.origin.x + bx * g.xWidM;
    const z0 = g.origin.z + bz * g.zWidM;
    const y00 = idx(bx, bz);
    const y01 = idx(bx, bz + 1);
    const y10 = idx(bx + 1, bz);
    const y11 = idx(bx + 1, bz + 1);

    const fx = (x - x0) / g.xWidM;
    const fz = (z - z0) / g.zWidM;

    // Diagonal runs (x,z+1)->(x+1,z); lower triangle includes (0,0).
    if (fx + fz <= 1) {
      return y00 + (y10 - y00) * fx + (y01 - y00) * fz;
    }
    return y11 + (y01 - y11) * (1 - fx) + (y10 - y11) * (1 - fz);
  }

  heightAt(x: number, z: number): number {
    let best = this.fallback;
    let covered = false;
    for (const e of this.exts) {
      const h = this.sampleGrid(e, x, z);
      if (h !== null) {
        covered = true;
        best = Math.max(best, h);
      }
    }
    return covered ? best : this.fallback;
  }

  normalAt(x: number, z: number): { x: number; y: number; z: number } {
    // Central differences on the interpolated field.
    const d = 1;
    const hx1 = this.heightAt(x + d, z);
    const hx0 = this.heightAt(x - d, z);
    const hz1 = this.heightAt(x, z + d);
    const hz0 = this.heightAt(x, z - d);
    const n = { x: (hx0 - hx1) / (2 * d), y: 1, z: (hz0 - hz1) / (2 * d) };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / len, y: n.y / len, z: n.z / len };
  }

  surfaceAt(x: number, z: number): SurfaceType {
    for (const r of this.paved) {
      if (Math.abs(x - r.x) <= r.widthM / 2 && Math.abs(z - r.z) <= r.lengthM / 2) {
        return "PAVED";
      }
    }
    return "GRASS";
  }
}
