import {
  type Entity,
  INVALID_ENTITY,
  ENTITY_INDEX_MASK,
  packEntity,
  entityIndex,
  entityGeneration,
} from "./entity.js";
import {
  type ComponentBundleItem,
  type ComponentType,
  type InferComponent,
  resolveBundleItem,
} from "./component.js";
import { Query, assertComponentTypes } from "./query.js";
import {
  type ResourceKey,
  resourceKeyId,
} from "./resource.js";
import { EventStore, type EventType } from "./event.js";
import {
  createStorageFor,
  type ComponentStorage,
  getPackedMeta,
  type SharedPackedStorage,
  type WasmMemoryArena,
} from "./storage/index.js";

/**
 * World owns entities, component storage, resources, and events.
 * Physical storage is per-component (object / packed / shared packed).
 */
export class World {
  private nextIndex = 1;
  private readonly freeIndices: number[] = [];
  private readonly generations: number[] = [];
  private readonly alive = new Set<Entity>();
  private readonly reserved = new Set<Entity>();
  private readonly stores = new Map<ComponentType, ComponentStorage>();
  private readonly entityComponents = new Map<Entity, Set<ComponentType>>();
  private readonly resources = new Map<symbol | ResourceKey, unknown>();
  private readonly eventStore = new EventStore();
  private wasmArena: WasmMemoryArena | null = null;

  spawn(...bundle: ComponentBundleItem[]): Entity {
    const entity = this.allocateEntity();
    this.alive.add(entity);
    this.entityComponents.set(entity, new Set());

    for (const item of bundle) {
      const { type, value } = resolveBundleItem(item);
      this.setComponent(entity, type, value);
    }

    return entity;
  }

  /** @internal */
  reserveEntity(): Entity {
    const entity = this.allocateEntity();
    this.reserved.add(entity);
    return entity;
  }

  /** @internal */
  realizeReserved(entity: Entity, bundle: ComponentBundleItem[]): void {
    if (!this.reserved.has(entity)) return;
    this.reserved.delete(entity);
    this.alive.add(entity);
    this.entityComponents.set(entity, new Set());
    for (const item of bundle) {
      const { type, value } = resolveBundleItem(item);
      this.setComponent(entity, type, value);
    }
  }

  despawn(entity: Entity): void {
    if (this.reserved.has(entity)) {
      this.reserved.delete(entity);
      this.recycleIndex(entity);
      return;
    }

    if (!this.alive.has(entity)) return;

    const types = this.entityComponents.get(entity);
    if (types) {
      for (const type of types) {
        this.stores.get(type)?.remove(entity);
      }
    }
    this.entityComponents.delete(entity);
    this.alive.delete(entity);
    this.recycleIndex(entity);
  }

  isAlive(entity: Entity): boolean {
    if (!this.alive.has(entity)) return false;
    const index = entityIndex(entity);
    return this.generations[index] === entityGeneration(entity);
  }

  add(entity: Entity, item: ComponentBundleItem): void {
    this.assertAlive(entity);
    const { type, value } = resolveBundleItem(item);
    this.setComponent(entity, type, value);
  }

  remove(entity: Entity, type: ComponentType): boolean {
    if (!this.isAlive(entity)) return false;
    const store = this.stores.get(type);
    if (!store?.has(entity)) return false;
    store.remove(entity);
    this.entityComponents.get(entity)?.delete(type);
    return true;
  }

  has(entity: Entity, type: ComponentType): boolean {
    if (!this.isAlive(entity)) return false;
    return this.stores.get(type)?.has(entity) ?? false;
  }

  get<C extends ComponentType>(
    entity: Entity,
    type: C,
  ): InferComponent<C> | undefined {
    if (!this.isAlive(entity)) return undefined;
    return this.stores.get(type)?.get(entity) as InferComponent<C> | undefined;
  }

  getOrThrow<C extends ComponentType>(
    entity: Entity,
    type: C,
  ): InferComponent<C> {
    const value = this.get(entity, type);
    if (value === undefined) {
      throw new Error(`Entity ${entity} missing component`);
    }
    return value;
  }

  query<Cs extends readonly ComponentType[]>(
    ...types: Cs
  ): Query<Cs> {
    assertComponentTypes(types as unknown as unknown[]);
    return new Query(this, types);
  }

  insertResource<T>(key: ResourceKey<T>, value: T): this {
    this.resources.set(resourceKeyId(key as ResourceKey), value);
    return this;
  }

  resource<T>(key: ResourceKey<T>): T {
    const value = this.resources.get(resourceKeyId(key as ResourceKey));
    if (value === undefined) {
      throw new Error(
        `Resource not found: ${typeof key === "function" ? key.name : (key as { name?: string }).name ?? "anonymous"}`,
      );
    }
    return value as T;
  }

  tryResource<T>(key: ResourceKey<T>): T | undefined {
    return this.resources.get(resourceKeyId(key as ResourceKey)) as T | undefined;
  }

  removeResource<T>(key: ResourceKey<T>): boolean {
    return this.resources.delete(resourceKeyId(key as ResourceKey));
  }

  hasResource<T>(key: ResourceKey<T>): boolean {
    return this.resources.has(resourceKeyId(key as ResourceKey));
  }

  send<T>(type: EventType<T>, value: T): void {
    this.eventStore.send(type, value);
  }

  events<T>(type: EventType<T>): IterableIterator<T> {
    return this.eventStore.read(type);
  }

  clearEvents(): void {
    this.eventStore.clear();
  }

  entityCount(): number {
    return this.alive.size;
  }

  *entities(): IterableIterator<Entity> {
    yield* this.alive;
  }

  components(entity: Entity): ComponentType[] {
    if (!this.isAlive(entity)) return [];
    return [...(this.entityComponents.get(entity) ?? [])];
  }

  inspect(entity: Entity): Record<string, unknown> {
    const out: Record<string, unknown> = {
      entity,
      index: entityIndex(entity),
      generation: entityGeneration(entity),
      alive: this.isAlive(entity),
    };
    for (const type of this.components(entity)) {
      const key = type.isTag
        ? (type as { name?: string }).name ?? String(type.id)
        : (type as { name?: string }).name ?? String(type.id);
      const val = this.get(entity, type);
      // Snapshot packed views into plain objects for inspect
      if (val && typeof val === "object" && "_slot" in (val as object)) {
        const snap: Record<string, number> = {};
        const meta = getPackedMeta(type);
        if (meta) {
          for (const f of meta.fields) {
            snap[f] = (val as Record<string, number>)[f]!;
          }
          out[key] = snap;
        } else {
          out[key] = val;
        }
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  /** @internal */
  componentStoreSize(type: ComponentType): number {
    return this.stores.get(type)?.size ?? 0;
  }

  /** @internal */
  *entitiesWith(type: ComponentType): IterableIterator<Entity> {
    const store = this.stores.get(type);
    if (!store) return;
    for (const entity of store.entities()) {
      if (this.isAlive(entity)) yield entity;
    }
  }

  /** Opt-in WASM-compatible shared memory arena for `backing: "wasm"` stores. */
  setWasmArena(arena: WasmMemoryArena | null): this {
    this.wasmArena = arena;
    return this;
  }

  getWasmArena(): WasmMemoryArena | null {
    return this.wasmArena;
  }

  /** @internal — storage handle for packed/shared worker paths */
  componentStorage(type: ComponentType): ComponentStorage | undefined {
    return this.stores.get(type);
  }

  /** Ensure storage exists (e.g. before shared worker descriptor). */
  ensureStorage(type: ComponentType): ComponentStorage {
    let store = this.stores.get(type);
    if (!store) {
      store = createStorageFor(type, { wasmArena: this.wasmArena });
      this.stores.set(type, store);
    }
    return store;
  }

  private allocateEntity(): Entity {
    let index: number;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop()!;
    } else {
      index = this.nextIndex++;
      if (index > ENTITY_INDEX_MASK) {
        throw new Error("Entity index space exhausted");
      }
      this.generations[index] = 0;
    }
    const generation = this.generations[index] ?? 0;
    return packEntity(index, generation);
  }

  private recycleIndex(entity: Entity): void {
    const index = entityIndex(entity);
    const gen = this.generations[index] ?? 0;
    this.generations[index] = (gen + 1) & 0xfff;
    this.freeIndices.push(index);
  }

  private assertAlive(entity: Entity): void {
    if (!this.isAlive(entity)) {
      throw new Error(`Entity ${entity} is not alive`);
    }
  }

  private setComponent(
    entity: Entity,
    type: ComponentType,
    value: unknown,
  ): void {
    let store = this.stores.get(type);
    if (!store) {
      store = createStorageFor(type, { wasmArena: this.wasmArena });
      this.stores.set(type, store);
    }
    store.set(entity, value);
    this.entityComponents.get(entity)!.add(type);
  }
}

export { INVALID_ENTITY };
export type { SharedPackedStorage };
