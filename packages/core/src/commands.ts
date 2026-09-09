import type { Entity } from "./entity.js";
import type {
  ComponentBundleItem,
  ComponentType,
} from "./component.js";
import type { World } from "./world.js";

type SpawnOp = {
  kind: "spawn";
  entity: Entity;
  bundle: ComponentBundleItem[];
};

type DespawnOp = {
  kind: "despawn";
  entity: Entity;
};

type AddOp = {
  kind: "add";
  entity: Entity;
  item: ComponentBundleItem;
};

type RemoveOp = {
  kind: "remove";
  entity: Entity;
  type: ComponentType;
};

type CommandOp = SpawnOp | DespawnOp | AddOp | RemoveOp;

/**
 * Deferred structural mutations.
 *
 * Semantics (v0.2):
 * 1. Visibility — commands apply when the buffer is flushed (after each system).
 * 2. Same-entity ops — applied in insertion order.
 * 3. Despawn then mutate — later add/remove on that entity in the same buffer
 *    are no-ops (entity is not alive after despawn is applied).
 * 4. Ordering — FIFO within a buffer.
 * 5. Stale/invalid entities — despawn/add/remove are silent no-ops.
 *
 * `spawn` reserves a generational entity id immediately so callers can
 * reference it before flush; the entity is not alive / queryable until flush.
 */
export class Commands {
  private ops: CommandOp[] = [];

  constructor(private readonly world: World) {}

  spawn(...bundle: ComponentBundleItem[]): Entity {
    const entity = this.world.reserveEntity();
    this.ops.push({ kind: "spawn", entity, bundle: [...bundle] });
    return entity;
  }

  despawn(entity: Entity): void {
    this.ops.push({ kind: "despawn", entity });
  }

  add(entity: Entity, item: ComponentBundleItem): void {
    this.ops.push({ kind: "add", entity, item });
  }

  remove(entity: Entity, type: ComponentType): void {
    this.ops.push({ kind: "remove", entity, type });
  }

  /** Number of queued ops (tests / DX). */
  get pending(): number {
    return this.ops.length;
  }

  /** Apply queued ops in order, then clear the buffer. */
  flush(): void {
    const ops = this.ops;
    this.ops = [];
    for (const op of ops) {
      switch (op.kind) {
        case "spawn":
          this.world.realizeReserved(op.entity, op.bundle);
          break;
        case "despawn":
          this.world.despawn(op.entity);
          break;
        case "add":
          if (this.world.isAlive(op.entity)) {
            this.world.add(op.entity, op.item);
          }
          break;
        case "remove":
          this.world.remove(op.entity, op.type);
          break;
      }
    }
  }
}
