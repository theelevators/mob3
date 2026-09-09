import type { Entity } from "./entity.js";
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

/**
 * World owns entities, component storage, resources, and events.
 * Storage is intentionally opaque (sparse Maps today).
 */
export class World {
  private nextEntity: Entity = 1;
  private readonly freeList: Entity[] = [];
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<ComponentType, Map<Entity, unknown>>();
  private readonly entityComponents = new Map<Entity, Set<ComponentType>>();
  private readonly resources = new Map<symbol | ResourceKey, unknown>();
  private readonly eventStore = new EventStore();

  /** Spawn an entity with zero or more components / tags. */
  spawn(...bundle: ComponentBundleItem[]): Entity {
    const entity =
      this.freeList.length > 0 ? this.freeList.pop()! : this.nextEntity++;
    this.alive.add(entity);
    this.entityComponents.set(entity, new Set());

    for (const item of bundle) {
      const { type, value } = resolveBundleItem(item);
      this.setComponent(entity, type, value);
    }

    return entity;
  }

  despawn(entity: Entity): void {
    if (!this.alive.has(entity)) return;

    const types = this.entityComponents.get(entity);
    if (types) {
      for (const type of types) {
        this.stores.get(type)?.delete(entity);
      }
    }
    this.entityComponents.delete(entity);
    this.alive.delete(entity);
    this.freeList.push(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  add<T>(entity: Entity, item: ComponentBundleItem): void {
    this.assertAlive(entity);
    const { type, value } = resolveBundleItem(item);
    this.setComponent(entity, type, value);
  }

  remove(entity: Entity, type: ComponentType): boolean {
    if (!this.alive.has(entity)) return false;
    const store = this.stores.get(type);
    if (!store?.has(entity)) return false;
    store.delete(entity);
    this.entityComponents.get(entity)?.delete(type);
    return true;
  }

  has(entity: Entity, type: ComponentType): boolean {
    return this.stores.get(type)?.has(entity) ?? false;
  }

  get<C extends ComponentType>(
    entity: Entity,
    type: C,
  ): InferComponent<C> | undefined {
    return this.stores.get(type)?.get(entity) as InferComponent<C> | undefined;
  }

  /** Get a component or throw. */
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

  /** Clear transient events (called at end of App.update). */
  clearEvents(): void {
    this.eventStore.clear();
  }

  /** Number of living entities. */
  entityCount(): number {
    return this.alive.size;
  }

  /** Iterate living entities. */
  *entities(): IterableIterator<Entity> {
    yield* this.alive;
  }

  /** Dev/DX: component types attached to an entity. */
  components(entity: Entity): ComponentType[] {
    return [...(this.entityComponents.get(entity) ?? [])];
  }

  /** Dev/DX: inspect entity component values. */
  inspect(entity: Entity): Record<string, unknown> {
    const out: Record<string, unknown> = { entity, alive: this.isAlive(entity) };
    for (const type of this.components(entity)) {
      const key = type.isTag
        ? (type as { name?: string }).name ?? String(type.id)
        : String(type.id);
      out[key] = this.get(entity, type);
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
    yield* store.keys();
  }

  private assertAlive(entity: Entity): void {
    if (!this.alive.has(entity)) {
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
      store = new Map();
      this.stores.set(type, store);
    }
    store.set(entity, value);
    this.entityComponents.get(entity)!.add(type);
  }
}
