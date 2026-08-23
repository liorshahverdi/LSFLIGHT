/**
 * YSFlight .fld -> JSON conversion (FLT-304).
 *
 * Produces a heightfield document: one merged elevation grid per TER item
 * plus map metadata. Node elevations include the item POS offset and the
 * field BASEELV so values are true altitudes in meters (Y-up).
 */
import { parseFld, type FldDocument, type FldElevationGrid, type FldItem } from "./parser.js";

export interface HeightfieldTerrain {
  kind: "elevationGrid";
  /** Block counts; node grid is (nx+1) x (nz+1). */
  nx: number;
  nz: number;
  /** Node spacing in meters. */
  xWidM: number;
  zWidM: number;
  /** World position of node (0,0). */
  origin: { x: number; z: number };
  /** True-altitude node elevations, row-major (z*(nx+1)+x), meters Y-up. */
  elevationsM: number[];
}

export interface FldConversion {
  format: "ysflight-fld";
  version: 1;
  source: string | null;
  name: string;
  baseElevationM: number;
  groundColorRGB: [number, number, number] | null;
  skyColorRGB: [number, number, number] | null;
  terrains: HeightfieldTerrain[];
  /** Item types present but not yet converted (pc2/pst/...). */
  unhandledItemTypes: string[];
}

function toHeightfield(
  grid: FldElevationGrid,
  posM: number[],
  baseElevationM: number,
): HeightfieldTerrain {
  return {
    kind: "elevationGrid",
    nx: grid.nx,
    nz: grid.nz,
    xWidM: grid.xWidM,
    zWidM: grid.zWidM,
    origin: { x: posM[0] ?? 0, z: posM[2] ?? 0 },
    elevationsM: grid.y.map((y) => y + baseElevationM),
  };
}

function collectTerrains(
  doc: FldDocument,
  baseElevationM: number,
  out: HeightfieldTerrain[],
): void {
  for (const it of doc.items) {
    if (it.kind === "ter") {
      out.push(toHeightfield(it.grid, it.posM, baseElevationM + (it.posM[1] ?? 0)));
    } else if (it.kind === "child") {
      // Nested .fld: parse recursively; child items carry their own POS.
      const child = parseFld(it.payloadLines.join("\n"));
      collectTerrains(child, child.baseElevationM, out);
    }
  }
}

export function convertFld(text: string, source: string | null = null): FldConversion {
  const doc: FldDocument = parseFld(text);
  const terrains: HeightfieldTerrain[] = [];
  collectTerrains(doc, doc.baseElevationM, terrains);
  return {
    format: "ysflight-fld",
    version: 1,
    source,
    name: doc.name,
    baseElevationM: doc.baseElevationM,
    groundColorRGB: doc.groundColorRGB,
    skyColorRGB: doc.skyColorRGB,
    terrains,
    unhandledItemTypes: [
      ...new Set(
        doc.items.filter((it: FldItem) => it.kind === "unhandled").map((it) => it.itemType),
      ),
    ],
  };
}

/** Sample terrain elevation at a world point using the reference triangles. */
export function sampleElevation(t: HeightfieldTerrain, x: number, z: number): number | null {
  const bx = Math.floor((x - t.origin.x) / t.xWidM);
  const bz = Math.floor((z - t.origin.z) / t.zWidM);
  if (bx < 0 || bz < 0 || bx >= t.nx || bz >= t.nz) return null;

  const nx1 = t.nx + 1;
  const idx = (ix: number, iz: number): number => t.elevationsM[iz * nx1 + ix] ?? 0;
  // Node layout mirrors GetTriangleNodeId: (x,z),(x,z+1),(x+1,z),(x+1,z+1).
  const p00 = { x: t.origin.x + bx * t.xWidM, z: t.origin.z + bz * t.zWidM, y: idx(bx, bz) };
  const p01 = { x: p00.x, z: p00.z + t.zWidM, y: idx(bx, bz + 1) };
  const p10 = { x: p00.x + t.xWidM, z: p00.z, y: idx(bx + 1, bz) };
  const p11 = { x: p00.x + t.xWidM, z: p00.z + t.zWidM, y: idx(bx + 1, bz + 1) };

  const fx = (x - p00.x) / t.xWidM;
  const fz = (z - p00.z) / t.zWidM;

  // Diagonal orientation per node's lup flag ("L" splits along the
  // other diagonal); default split runs from (x,z+1) to (x+1,z).
  const lowerTriangleFirst = fx + fz <= 1;
  let e: number;
  if (lowerTriangleFirst) {
    // Triangle (00, 10, 01) via barycentric on the unit square.
    e = p00.y + (p10.y - p00.y) * fx + (p01.y - p00.y) * fz;
  } else {
    // Triangle (11, 01, 10).
    e = p11.y + (p01.y - p11.y) * (1 - fx) + (p10.y - p11.y) * (1 - fz);
  }
  return e;
}
