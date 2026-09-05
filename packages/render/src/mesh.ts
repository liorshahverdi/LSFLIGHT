import * as THREE from "three";

/** Converted YSFlight mesh document (tools/convert-dnm output). */
export interface MeshDoc {
  positions: number[];
  colors: number[];
  indices: number[];
  schemaVersion?: number;
  sourceFormat?: string;
}

export function validateMeshDoc(doc: unknown): doc is MeshDoc {
  const m = doc as MeshDoc;
  if (!m || !Array.isArray(m.positions) || !Array.isArray(m.colors) || !Array.isArray(m.indices)) {
    return false;
  }
  for (const values of [m.positions, m.colors]) {
    for (const value of values) if (!Number.isFinite(value)) return false;
  }
  if (m.indices.length === 0 || m.indices.length % 3 !== 0) return false;
  const nVerts = m.positions.length / 3;
  for (const i of m.indices) {
    if (!Number.isInteger(i) || i < 0 || i >= nVerts) return false;
  }
  return m.positions.length % 3 === 0 && m.colors.length === m.positions.length;
}

export function meshDocToGeometry(doc: MeshDoc): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(doc.positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(doc.colors, 3));
  geo.setIndex(doc.indices);
  geo.computeVertexNormals();
  return geo;
}
