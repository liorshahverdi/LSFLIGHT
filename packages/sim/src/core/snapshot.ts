/**
 * Deterministic snapshots & hashing (FLT-105).
 *
 * Canonical serialization: object keys sorted, numbers via Number.toString()
 * (shortest round-trip representation), arrays in order. FNV-1a 64-bit-ish
 * hash over the canonical string, returned as 16 hex chars.
 */
/* eslint-disable */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function canonical(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`snapshot: non-finite number ${value} (NaN/Inf forbidden in sim state)`);
    }
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  throw new Error(`snapshot: unsupported value type ${typeof value}`);
}

export function hashSnapshot(snapshot: unknown): string {
  const s = canonical(snapshot);
  // FNV-1a 64 implemented with two 32-bit lanes to stay exact in JS.
  let hHi = 0x3436fd45 | 0;
  let hLo = 0x84222325 | 0;
  const primeLo = 0x93d765dd | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    hLo = Math.imul(hLo ^ c, primeLo);
    hHi = Math.imul(hHi ^ (c + i), 0x85ebca6b);
  }
  hLo = Math.imul(hLo ^ (hLo >>> 15), 0x2545f491);
  hHi = Math.imul(hHi ^ (hHi >>> 13), 0xc2b2ae35);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(hHi) + hex(hLo);
}

export interface WorldSnapshotEntity {
  id: number;
  kind?: string;
  [k: string]: unknown;
}

export interface WorldSnapshot {
  entityCount: number;
  entities: WorldSnapshotEntity[];
}

/** Snapshot any World-like registry into plain serializable data. */
export function snapshotWorld<E extends { id: number }>(world: {
  all(): IterableIterator<E>;
}): WorldSnapshot {
  const entities: WorldSnapshotEntity[] = [];
  for (const e of world.all()) {
    entities.push(JSON.parse(JSON.stringify(e)) as WorldSnapshotEntity);
  }
  return { entityCount: entities.length, entities };
}

/* eslint-enable */
