import { describe, it, expect } from "vitest";
import { World } from "../src/core/world.js";

interface TestEntity {
  id: number;
  kind: "aircraft" | "projectile" | "missile" | "ground";
  alive: boolean;
}

describe("World entity registry (FLT-102)", () => {
  function makeWorld() {
    return new World<TestEntity>();
  }

  it("spawns entities with unique increasing ids", () => {
    const world = makeWorld();
    const a = world.spawn({ id: 0, kind: "aircraft", alive: true });
    const b = world.spawn({ id: 0, kind: "projectile", alive: true });
    expect(a.id).toBeGreaterThan(0);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("queries by id and by kind", () => {
    const world = makeWorld();
    const a = world.spawn({ id: 0, kind: "aircraft", alive: true });
    world.spawn({ id: 0, kind: "ground", alive: true });
    expect(world.get(a.id)?.kind).toBe("aircraft");
    expect(world.byKind("ground")).toHaveLength(1);
    expect(world.byKind("aircraft")).toHaveLength(1);
  });

  it("removes entities and they disappear from queries", () => {
    const world = makeWorld();
    const p = world.spawn({ id: 0, kind: "projectile", alive: true });
    expect(world.remove(p.id)).toBe(true);
    expect(world.get(p.id)).toBeUndefined();
    expect(world.remove(p.id)).toBe(false);
  });

  it("iteration order is stable (insertion-sorted by id) for determinism", () => {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) {
      world.spawn({ id: 0, kind: i % 2 ? "projectile" : "aircraft", alive: true });
    }
    const order1 = [...world.all()].map((e) => e.id);
    const order2 = [...world.all()].map((e) => e.id);
    expect(order1).toEqual(order2);
    expect([...order1].sort((a, b) => a - b)).toEqual(order1);
  });

  it("removal during iteration is safe and order-stable", () => {
    const world = makeWorld();
    Array.from({ length: 5 }, () => world.spawn({ id: 0, kind: "projectile", alive: true }).id);
    const removed: number[] = [];
    for (const e of world.all()) {
      if (e.id % 2 === 1) {
        world.remove(e.id);
        removed.push(e.id);
      }
    }
    expect(removed.length).toBeGreaterThan(0);
    for (const id of removed) expect(world.get(id)).toBeUndefined();
    expect([...world.all()].every((e) => !removed.includes(e.id))).toBe(true);
  });
});
