/**
 * YSFlight .dnm -> mesh JSON converter (FLT-303).
 *
 * .dnm is a text format:
 *   DYNAMODEL / DNMVER header
 *   PCK "name" lineCount  ->  SURF section of lineCount lines containing
 *   packed SRF text (V xyz / F face-start / V indices / N normals / C rgb / E)
 *   SRF "name" nodes with FIL chunk reference and POS translation.
 *
 * Output coordinates are converted to the sim/render frame:
 *   dnm (x,y,z) -> sim (-x, y, -z)  [+Z forward becomes -Z forward],
 * with triangle winding reversed to keep normals outward.
 *
 * v0.1 limitation: node rotations (the 3 values after translation in POS)
 * are ignored with a warning; they are zero for most static aircraft.
 */

export interface MeshJson {
  /** Flat xyz positions. */
  positions: number[];
  /** Flat rgb per vertex, 0..1. */
  colors: number[];
  /** Triangle indices. */
  indices: number[];
}

interface Chunk {
  vertices: [number, number, number][];
  faces: { verts: number[]; color: [number, number, number] | undefined }[];
}

interface Node {
  file: string;
  pos: [number, number, number];
  rotationNonZero: boolean;
}

const DEFAULT_COLOR: [number, number, number] = [128, 128, 128];

export function convertDnm(source: string): {
  mesh: MeshJson;
  warnings: string[];
} {
  const lines = source.split(/\r?\n/);
  const chunks = new Map<string, Chunk>();
  const nodes: Node[] = [];
  const warnings: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (line.startsWith("PCK")) {
      const m = line.match(/^PCK\s+"?([^"\s]+)"?\s+(\d+)/);
      if (!m) throw new Error(`convert-dnm: bad PCK line: ${line}`);
      const name = m[1] as string;
      const count = parseInt(m[2] as string, 10);
      i += 2; // skip PCK line + SURF line
      chunks.set(name, parseSrfChunk(lines.slice(i, i + count)));
      i += count;
      continue;
    }
    if (line.startsWith("SRF ")) {
      const name = line.slice(4).trim().replace(/"/g, "");
      let j = i + 1;
      let file = name;
      let pos: [number, number, number] = [0, 0, 0];
      let rotNonZero = false;
      while (j < lines.length) {
        const l = (lines[j] ?? "").trim();
        if (l.startsWith("POS")) {
          const p = l.split(/\s+/).slice(1).map(parseFloat);
          pos = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
          rotNonZero =
            Math.abs(p[3] ?? 0) > 1e-9 || Math.abs(p[4] ?? 0) > 1e-9 || Math.abs(p[5] ?? 0) > 1e-9;
          break;
        }
        j++;
        if (j - i > 50) break; // malformed guard
      }
      // FIL may appear before or after POS; scan the whole block for it.
      let k = i + 1;
      while (k < lines.length && !(lines[k] ?? "").trim().startsWith("END")) {
        const l = (lines[k] ?? "").trim();
        if (l.startsWith("FIL")) {
          file = l.split(/\s+/)[1]?.replace(/"/g, "") ?? name;
          break;
        }
        k++;
      }
      nodes.push({ file, pos, rotationNonZero: rotNonZero });
      void name;
      i = j;
      continue;
    }
    i++;
  }

  // Assemble mesh per node.
  const outPositions: number[] = [];
  const outColors: number[] = [];
  const outIndices: number[] = [];

  for (const node of nodes) {
    const chunk = chunks.get(node.file);
    if (!chunk) continue;
    if (node.rotationNonZero) {
      warnings.push(`non-zero node rotation ignored on ${node.file}`);
    }

    const base = outPositions.length / 3;
    // Vertex colors: last face color wins (faces share vertices rarely here).
    const vertColor = new Map<number, [number, number, number]>();
    for (const f of chunk.faces) {
      if (!f.color) continue;
      for (const vi of f.verts) vertColor.set(vi - 1, f.color);
    }

    for (const [x, y, z] of chunk.vertices) {
      const wx = x + node.pos[0];
      const wy = y + node.pos[1];
      const wz = z + node.pos[2];
      // Frame conversion: dnm -> sim.
      outPositions.push(-wx, wy, -wz);
      const col = vertColor.get(outPositions.length / 3 - 1 - 0) ?? DEFAULT_COLOR;
      void col;
    }
    // Colors pass (separate to keep index math simple).
    for (let vi = 0; vi < chunk.vertices.length; vi++) {
      const col = vertColor.get(vi) ?? DEFAULT_COLOR;
      outColors.push(col[0] / 255, col[1] / 255, col[2] / 255);
    }

    for (const f of chunk.faces) {
      // Fan-triangulate polygons; reverse winding for the axis flip.
      for (let k = 2; k < f.verts.length; k++) {
        outIndices.push(
          base + (f.verts[0] as number) - 1,
          base + (f.verts[k] as number) - 1,
          base + (f.verts[k - 1] as number) - 1,
        );
      }
    }
  }

  return {
    mesh: { positions: outPositions, colors: outColors, indices: outIndices },
    warnings,
  };
}

function parseSrfChunk(chunkLines: string[]): Chunk {
  const vertices: [number, number, number][] = [];
  const faces: { verts: number[]; color: [number, number, number] | undefined }[] = [];
  let cur: { verts: number[]; color: [number, number, number] | undefined } | undefined;

  for (const raw of chunkLines) {
    const t = raw.trim();
    if (t === "F") {
      cur = { verts: [], color: undefined };
      faces.push(cur);
      continue;
    }
    if (t === "E") {
      cur = undefined;
      continue;
    }
    if (t.startsWith("V ")) {
      const p = t.split(/\s+/).slice(1).map(parseFloat);
      if (cur) {
        // Face index list: every number on the line is a vertex index.
        for (const n of p) cur.verts.push(n); // 1-based
      } else {
        vertices.push([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]);
      }
      continue;
    }
    if (t.startsWith("C ") && cur) {
      const c = t.split(/\s+/).slice(1).map(parseFloat);
      cur.color = [c[0] ?? 128, c[1] ?? 128, c[2] ?? 128];
    }
  }
  return { vertices, faces };
}
