# Phase 10 Design — Assets & Async Lifecycle

## Question

> Can external asynchronous resources participate cleanly in a mob3 world without leaking promises into systems?

Non-negotiable: **loading ≠ scheduler execution**. Promise callbacks only enqueue; `AssetMaintenance` applies transitions at a defined schedule boundary (`PreUpdate`).

## 1. Asset identity

```ts
AssetHandle<T> = { typeId, index, generation, key }
```

- Cheap to copy; typed in TypeScript via phantom `T`
- Identity is registry slot + generation (stale after unload/reuse)
- `key` is human-readable for debug; **not** required to be a URL

## 2. Handle semantics

- `assets.load(AssetType, key)` → handle + retain(+1) + start load if needed
- `assets.retain` / `assets.release` — explicit refcount
- Stale generation → state `absent`; never aliases a later asset in the same slot

## 3. Registry ownership

`AssetRegistry` is a World **resource**, installed by `AssetsPlugin`.  
Loaders registered via public `assets.registerLoader(AssetType, loader)`.

Package: `@mob3/assets` — no THREE / DOM / GLTF.

## 4. Loading state machine

```
absent → loading → ready
                 → failed
                 → cancelled (last consumer released while in-flight + abort)
```

Inspectable synchronously: `assets.state(handle)`, `assets.get(handle)`, `assets.error(handle)`.

## 5. Deduplication

Cache key: `${assetType.id.description ?? name}::${normalizedKey}`  
Same type + same key + same options fingerprint → one in-flight / cached entry.  
Materially different options → different key (options serialized into fingerprint when present).

## 6. Reference / lifetime

- `load` and `retain` increment `refCount`
- `release` decrements; at 0 → **eligible** for unload
- Default policy: **explicit** `assets.unload(handle)` (or `release` with `{ unload: true }`)
- Instantiation that retains the asset must document it; despawn of instances releases only if instantiate retained

## 7. Cancellation

Shared `AbortController` per in-flight entry.  
Abort **only** when `refCount` hits 0 while still `loading` (or App.dispose).  
One consumer releasing while others remain → request continues.

## 8. Loader interface

```ts
interface AssetLoader<T> {
  load(req: AssetRequest, ctx: AssetLoadContext): Promise<T>
  dispose?(value: T): void  // owned values only
}
```

`AssetLoadContext`: `{ signal: AbortSignal, key: string }`

## 9. Three ownership

- `@mob3/three` registers `GltfAsset` loader (public API)
- Loaded value owns geometries/materials/textures collected from parse
- Instances clone Object3D trees; **share** geo/mat/tex
- Instance despawn does **not** dispose shared GPU resources
- Asset unload / App.dispose disposes owned resources **once**

## 10. Asset vs instance

Asset = registry data.  
`instantiateGltf(world, handle)` → root Entity + ECS Parent/Children + Transform + ThreeObject (flat scene).  
No prefab framework. Optional `AssetInstance` component for queries only if natural.

## 11. App disposal

- Abort all in-flight owned loads
- Ignore late promise completions (generation / disposed flag)
- Dispose all owned ready values once
- Clear registry; no events into dead World

## 12. Headless testing

`FakeAssetLoader` + `JsonAsset` in `@mob3/assets` — no Three.  
Three GLTF tests use `GLTFLoader.parse` on an inline fixture.

## Visibility boundary

```
Promise settle → enqueue PendingTransition
Update (assetMaintenance, registered first) → apply state + emit AssetReady/AssetFailed
later Update systems observe
```

Note: App clears events before each FixedUpdate. Emitting in PreUpdate would drop
AssetReady before Update gameplay. Maintenance therefore runs early in Update.

No second async scheduler.
