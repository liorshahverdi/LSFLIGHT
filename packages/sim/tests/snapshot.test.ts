import { describe, it, expect } from "vitest";
import { World } from "../src/core/world.js";
import { SimClock } from "../src/core/clock.js";
import { snapshotWorld, hashSnapshot } from "../src/core/snapshot.js";

interface E {
  id: number;
  kind: string;
  x: number;
}

function makeWorld(): World<E> {
  const w = new World<E>();
  w.spawn({ kind: "aircraft", x: 1 / 3 });
  w.spawn({ kind: "aircraft", x: 123456.7890123 });
  w.spawn({ kind: "projectile", x: -0.001 });
  return w;
}

describe("Snapshot & hash (FLT-105)", () => {
  it("identical states produce identical hashes", () => {
    const h1 = hashSnapshot(snapshotWorld(makeWorld()));
    const h2 = hashSnapshot(snapshotWorld(makeWorld()));
    expect(h1).toBe(h2);
  });

  it("any state change changes the hash", () => {
    const snap = snapshotWorld(makeWorld());
    (snap.entities[0] as Record<string, unknown>)["x"] = 999;
    expect(hashSnapshot(snap)).not.toBe(hashSnapshot(snapshotWorld(makeWorld())));
  });

  it("snapshot survives a JSON round-trip with identical hash (full float precision)", () => {
    const snap = snapshotWorld(makeWorld());
    const json = JSON.stringify(snap);
    const revived = JSON.parse(json) as typeof snap;
    expect(hashSnapshot(revived)).toBe(hashSnapshot(snap));
  });

  it("hashes are stable across runs (deterministic serialization)", () => {
    const clock = new SimClock(1 / 60);
    for (let i = 0; i < 60; i++) clock.step();
    const s1 = {
      tick: clock.tick,
      time: clock.time,
      entities: snapshotWorld(makeWorld()).entities,
    };
    const s2 = {
      tick: clock.tick,
      time: clock.time,
      entities: snapshotWorld(makeWorld()).entities,
    };
    expect(hashSnapshot(s1)).toBe(hashSnapshot(s2));
  });

  it("hash format: 16-hex-char fnv1a string", () => {
    const h = hashSnapshot(snapshotWorld(makeWorld()));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
