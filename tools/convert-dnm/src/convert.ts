/**
 * YSFlight .dnm -> mesh JSON converter (FLT-303).
 *
 * .dnm is a text format:
 *   DYNAMODEL / DNMVER header
 *   PCK "name" lineCount  ->  SURF section of lineCount lines containing
 *   packed SRF text (V xyz / F face-start / V indices / N normals / C rgb / E)
 *   SRF "name" nodes with FIL, CLD hierarchy, POS placement and CNT pivot.
 *
 * Output coordinates are converted to the sim/render frame:
 *   dnm (x,y,z) -> sim (-x, y, -z)  [+Z forward becomes -Z forward],
 * a proper 180-degree Y rotation, so triangle winding is preserved after
 * orienting source polygons to their explicit SRF outward normals.
 *
 * Static neutral pose matches YsShellDnmContainer::DnmState (zero relative
 * position/attitude, visible). STA/CLA/PAX describe animation, not the bind pose;
 * they are not evaluated. See docs/high-severity-fixes.md for upstream evidence.
 */

export interface MeshJson {
  /** Flat xyz positions. */
  positions: number[];
  /** Flat rgb per vertex, 0..1. */
  colors: number[];
  /** Triangle indices. */
  indices: number[];
}

interface Face {
  verts: number[];
  color?: [number, number, number];
  normal?: [number, number, number];
}

interface Chunk {
  vertices: [number, number, number][];
  faces: Face[];
}

type Point = [number, number, number];
interface Node {
  name: string;
  file: string;
  pos: Point;
  rotation: Point;
  center: Point;
  children: string[];
}

function numbers(line: string, count: number): number[] {
  const values = line.split(/\s+/).slice(1).map(Number);
  if (values.length !== count || !values.every(Number.isFinite))
    throw new Error(`convert-dnm: invalid transform/metadata: ${line}`);
  return values;
}

/** T(POS) * RotateXZ(h) * RotateZY(p) * RotateXY(b) * T(-CNT).
 * DNM angles are 32768 units per PI, not degrees. Apply rightmost first.
 */
function placeVertex(vertex: Point, node: Node): Point {
  const [h, p, b] = node.rotation.map((a) => (a * Math.PI) / 32768) as Point;
  const x = vertex[0] - node.center[0];
  const y = vertex[1] - node.center[1];
  const z = vertex[2] - node.center[2];
  const bx = Math.cos(b) * x - Math.sin(b) * y;
  const by = Math.sin(b) * x + Math.cos(b) * y;
  const py = Math.cos(p) * by + Math.sin(p) * z;
  const pz = -Math.sin(p) * by + Math.cos(p) * z;
  return [
    node.pos[0] + Math.cos(h) * bx - Math.sin(h) * pz,
    node.pos[1] + py,
    node.pos[2] + Math.sin(h) * bx + Math.cos(h) * pz,
  ];
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
      i++; // PCK count includes the Surf header, not the PCK line.
      if (lines[i]?.trim().toUpperCase() !== "SURF" || i + count > lines.length) {
        throw new Error(`convert-dnm: invalid packed surface ${name}`);
      }
      if (chunks.has(name)) throw new Error(`convert-dnm: duplicate packed surface ${name}`);
      chunks.set(name, parseSrfChunk(lines.slice(i, i + count)));
      i += count;
      continue;
    }
    if (line.startsWith("SRF ")) {
      const name = line.slice(4).trim().replace(/"/g, "");
      let j = i + 1;
      let file = name;
      let pos: Point = [0, 0, 0];
      let rotation: Point = [0, 0, 0];
      let center: Point = [0, 0, 0];
      const children: string[] = [];
      let stateCount = 0;
      let expectedStates: number | undefined;
      let expectedChildren: number | undefined;
      while (j < lines.length && lines[j]?.trim() !== "END") {
        const l = (lines[j] ?? "").trim();
        const keyword = l.split(/\s+/)[0];
        if (keyword === "POS") {
          // Legacy DNM writes an extra show field; upstream POS ignores it.
          const fields = l.split(/\s+/).length - 1;
          const p = numbers(l, fields === 7 ? 7 : 6);
          pos = p.slice(0, 3) as Point;
          rotation = p.slice(3, 6) as Point;
        } else if (keyword === "CNT") {
          center = numbers(l, 3) as Point;
        } else if (keyword === "FIL") {
          file = l.slice(4).trim().replace(/"/g, "");
        } else if (keyword === "CLD") {
          children.push(l.slice(4).trim().replace(/"/g, ""));
        } else if (keyword === "STA") {
          numbers(l, 7);
          stateCount++;
        } else if (keyword === "NST") {
          expectedStates = numbers(l, 1)[0];
        } else if (keyword === "NCH") {
          expectedChildren = numbers(l, 1)[0];
        } else if (keyword === "CLA") {
          numbers(l, 1);
        } else if (keyword === "PAX") {
          numbers(l, 3);
        } else if (l && !l.startsWith("#") && l !== "REL DEP") {
          throw new Error(`convert-dnm: unsupported node directive on ${name}: ${l}`);
        }
        j++;
      }
      if (j === lines.length) throw new Error(`convert-dnm: unterminated node ${name}`);
      if (expectedStates !== undefined && stateCount !== expectedStates)
        throw new Error(`convert-dnm: NST count mismatch on ${name}`);
      if (expectedChildren !== undefined && children.length !== expectedChildren)
        throw new Error(`convert-dnm: NCH count mismatch on ${name}`);
      if (stateCount > 0 && warnings.length === 0)
        warnings.push("static neutral pose: STA animation states are not evaluated");
      nodes.push({ name, file, pos, rotation, center, children });
      i = j + 1;
      continue;
    }
    if (
      line &&
      !line.startsWith("#") &&
      line !== "DYNAMODEL" &&
      line !== "DNMVER 1" &&
      line !== "END"
    )
      throw new Error(`convert-dnm: unsupported directive: ${line}`);
    i++;
  }

  const byName = new Map<string, Node>();
  for (const node of nodes) {
    if (byName.has(node.name)) throw new Error(`convert-dnm: duplicate node ${node.name}`);
    byName.set(node.name, node);
  }
  const parents = new Map<Node, Node>();
  for (const node of nodes) {
    for (const name of node.children) {
      const child = byName.get(name);
      if (!child) throw new Error(`convert-dnm: missing child ${name}`);
      if (parents.has(child)) throw new Error(`convert-dnm: multiple parents for ${name}`);
      parents.set(child, node);
    }
  }
  const chains = new Map<Node, Node[]>();
  for (const node of nodes) {
    const chain: Node[] = [];
    let ancestor: Node | undefined = node;
    while (ancestor) {
      if (chain.includes(ancestor)) throw new Error(`convert-dnm: hierarchy cycle at ${node.name}`);
      chain.push(ancestor);
      ancestor = parents.get(ancestor);
    }
    chains.set(node, chain);
  }

  // Assemble mesh per node.
  const outPositions: number[] = [];
  const outColors: number[] = [];
  const outIndices: number[] = [];

  for (const node of nodes) {
    const chunk = chunks.get(node.file);
    if (!chunk) throw new Error(`convert-dnm: missing packed surface ${node.file}`);

    const base = outPositions.length / 3;
    // Vertex colors: last face color wins (faces share vertices rarely here).
    const vertColor = new Map<number, [number, number, number]>();
    for (const f of chunk.faces) {
      if (!f.color) continue;
      for (const vi of f.verts) vertColor.set(vi, f.color);
    }

    for (const vertex of chunk.vertices) {
      const [wx, wy, wz] = chains.get(node)!.reduce(placeVertex, vertex);
      // Frame conversion: dnm -> sim.
      outPositions.push(-wx, wy, -wz);
    }
    // Colors pass (separate to keep index math simple).
    for (let vi = 0; vi < chunk.vertices.length; vi++) {
      const col = vertColor.get(vi) ?? DEFAULT_COLOR;
      outColors.push(col[0] / 255, col[1] / 255, col[2] / 255);
    }

    for (const f of chunk.faces) {
      // Fan-triangulate zero-based SRF polygons; a two-axis flip preserves winding.
      for (let k = 2; k < f.verts.length; k++) {
        outIndices.push(
          base + (f.verts[0] as number),
          base + (f.verts[k - 1] as number),
          base + (f.verts[k] as number),
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
  const faces: Face[] = [];
  let cur: Face | undefined;

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
        for (const n of p) cur.verts.push(n); // zero-based
      } else {
        vertices.push([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]);
      }
      continue;
    }
    if (t.startsWith("N ") && cur) {
      // SRF N is face-center xyz followed by direction xyz, not just a normal.
      const n = t.split(/\s+/).slice(1).map(Number);
      if (n.length !== 6 || !n.every(Number.isFinite))
        throw new Error("convert-dnm: invalid face normal");
      cur.normal = [n[3]!, n[4]!, n[5]!];
    }
    if (t.startsWith("C ") && cur) {
      const c = t.split(/\s+/).slice(1).map(parseFloat);
      cur.color = [c[0] ?? 128, c[1] ?? 128, c[2] ?? 128];
    }
  }
  if (vertices.some((v) => !v.every(Number.isFinite)))
    throw new Error("convert-dnm: invalid vertex");
  for (const face of faces) {
    if (
      face.verts.length < 3 ||
      face.verts.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices.length)
    ) {
      throw new Error("convert-dnm: invalid face index");
    }
    if (face.color && !face.color.every(Number.isFinite))
      throw new Error("convert-dnm: invalid color");
    if (face.normal) {
      // Legacy SRFs can wind opposite to their explicit outward normal.
      // Sum polygon area vectors (Newell); absent/zero normals keep source order.
      const area = [0, 0, 0];
      for (let i = 0; i < face.verts.length; i++) {
        const a = vertices[face.verts[i]!]!;
        const b = vertices[face.verts[(i + 1) % face.verts.length]!]!;
        area[0]! += (a[1] - b[1]) * (a[2] + b[2]);
        area[1]! += (a[2] - b[2]) * (a[0] + b[0]);
        area[2]! += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const alignment = area.reduce((sum, n, i) => sum + n * face.normal![i]!, 0);
      if (alignment < 0) face.verts = [face.verts[0]!, ...face.verts.slice(1).reverse()];
    }
  }
  return { vertices, faces };
}
