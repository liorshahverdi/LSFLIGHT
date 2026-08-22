/**
 * Simulation entity registry (FLT-102).
 *
 * Deterministic container: entities iterate in insertion order (which is id
 * order since ids increase monotonically). Removal during iteration is safe —
 * removals are staged and applied after the current pass.
 *
 * Entities with a string `kind` field can be queried via byKind(kind).
 */
export interface WorldEntity {
  id: number;
}

export class World<E extends WorldEntity> {
  private nextId = 1;
  private readonly entities = new Map<number, E>();
  /** Ids queued for removal while an iteration is in progress. */
  private pendingRemoval = new Set<number>();
  private iterating = false;

  /** Assign a unique id and register the entity. Returns the same entity. */
  spawn(entity: Omit<E, "id"> & { id?: number }): E {
    const e = { ...entity, id: this.nextId++ } as E;
    this.entities.set(e.id, e);
    return e;
  }

  get(id: number): E | undefined {
    return this.entities.get(id);
  }

  /** Stable, insertion(id)-ordered iteration. Removal inside the loop is deferred. */
  *all(): IterableIterator<E> {
    this.iterating = true;
    try {
      for (const e of this.entities.values()) {
        if (this.pendingRemoval.has(e.id)) continue;
        yield e;
      }
    } finally {
      this.iterating = false;
      if (this.pendingRemoval.size > 0) {
        for (const id of this.pendingRemoval) this.entities.delete(id);
        this.pendingRemoval.clear();
      }
    }
  }

  remove(id: number): boolean {
    if (!this.entities.has(id)) return false;
    if (this.iterating) this.pendingRemoval.add(id);
    else this.entities.delete(id);
    return true;
  }

  get size(): number {
    return this.entities.size - this.pendingRemoval.size;
  }

  /** Query entities whose `kind` field equals the given string, in id order. */
  byKind(kind: string): E[] {
    const out: E[] = [];
    for (const e of this.all()) {
      if ((e as { kind?: string }).kind === kind) out.push(e);
    }
    return out;
  }
}
