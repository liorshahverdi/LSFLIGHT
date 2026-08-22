/**
 * Terrain collision query interface (FLT-501).
 *
 * The sim depends only on this interface; converted heightmap terrain
 * (FLT-304/601) will implement it. FlatTerrain serves development and tests.
 */

export type SurfaceType = "PAVED" | "GRASS" | "WATER";

export interface RunwaySpec {
  id: string;
  center: { x: number; z: number };
  widthM: number;
  lengthM: number;
  /** Compass heading of the runway centerline in degrees. */
  headingDeg: number;
}

export interface TerrainProvider {
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): { x: number; y: number; z: number };
  surfaceAt(x: number, z: number): SurfaceType;
}

/** Flat world with optional paved runway rectangles (development stand-in). */
export class FlatTerrain implements TerrainProvider {
  constructor(private readonly runways: { runways: RunwaySpec[] }) {}

  heightAt(_x: number, _z: number): number {
    return 0;
  }

  normalAt(_x: number, _z: number): { x: number; y: number; z: number } {
    return { x: 0, y: 1, z: 0 };
  }

  surfaceAt(x: number, z: number): SurfaceType {
    for (const rw of this.runways.runways) {
      // Runway local frame: along centerline by heading, across by width.
      const hRad = (rw.headingDeg * Math.PI) / 180;
      // Heading 180 = aligned with -Z (north-south runway).
      const fwdX = -Math.sin(hRad);
      const fwdZ = -Math.cos(hRad);
      const dx = x - rw.center.x;
      const dz = z - rw.center.z;
      const along = dx * fwdX + dz * fwdZ;
      const across = dx * -fwdZ + dz * fwdX;
      if (Math.abs(along) <= rw.lengthM / 2 && Math.abs(across) <= rw.widthM / 2) {
        return "PAVED";
      }
    }
    return "GRASS";
  }
}
