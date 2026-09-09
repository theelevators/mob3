# Phase 10 Findings — Assets & Async Lifecycle

## Asset identity

`AssetHandle<T>` = `{ typeId, index, generation, key, typeName }`.  
Cheap copy. Generation invalidates after unload/slot reuse. Key is diagnostic, not necessarily a URL.

## Loading state

`absent → loading → ready | failed | cancelled`  
Inspect: `state` / `status` / `get` / `error` / `isReady`.

## Async visibility

Promise callbacks **only enqueue** `PendingTransition`.  
`assetMaintenance` (Update, registered by `AssetsPlugin`) applies transitions and emits `AssetReady` / `AssetFailed`.

Why not PreUpdate: `App.update` clears events before each FixedUpdate, which would drop PreUpdate events before gameplay Update. Early Update preserves event visibility this frame.

Systems never `await` loads.

## Deduplication

Dedupe key: `typeName::key::JSON(options)`.  
100 identical pending loads → one loader invocation.

## Lifetime

`load` / `retain` / `insert` → +ref.  
`release` → −ref. At 0 while loading → abort.  
Ready at 0 stays cached until explicit `unload` (or `release({ unload: true })`).

## Ownership

`ownership: "owned"` (default) → loader `dispose` on unload/App.dispose.  
`ownership: "external"` → never disposed by registry.

## Asset vs instance

Asset = registry value.  
`instantiateGltf` → independent ECS entity trees (Parent/Children + Transform + ThreeObject).  
Optional `AssetInstanceRef` component. Instantiate retains (+1); `despawnGltfInstance` releases.

## Three GLTF

`GltfAsset` + `createGltfLoader` via public `registerLoader`.  
`GLTFLoader.parse` / fetch resolve. Static meshes only.  
ECS hierarchy from scene nodes; flat Scene attach + GlobalTransform sync (Phase 9 model).

## Shared Three resources

Per-instance: Object3D clones (`clone(false)`).  
Shared: BufferGeometry, Material, Texture.  
Instance despawn → dispose counts stay 0. Final asset unload → dispose once.

## Headless

`@mob3/assets` FakeAsset / JsonAsset — no Three.  
Hangar headless uses inserted generated mesh asset.

## Cancellation

Shared AbortController. Abort only when last consumer releases while loading (or App.dispose).

## Disposal

App.dispose → abort in-flight, dispose owned ready values, ignore late completions, empty registry.

## Performance (`npm run bench:assets`)

See bench output — dedupe of 1000 identical loads is cheap; transition flush scales with pending completions only (empty frames cost ~0).

## DX pain

- Must remember events land in Update after maintenance (order with `after: assetMaintenance` if observing same schedule)
- Explicit retain/release is honest but easy to mismatch
- GLTF in Node still awkward without `resolve` — fixtures/insert preferred for tests

## Future needs (proven)

- Optional Loading/Playing app states if hangar UI bookkeeping grows
- Animation/skinning ownership (Phase 11)
- Not needed yet: LRU, manifests, worker loaders, ABI handles

## Architectural answers

> Can a normal gameplay system react to ready without awaiting?

**YES** — poll `isReady` or `AssetReady` after maintenance.

> Can three instances share one asset with independent hierarchies?

**YES.**

> Can the final instance vanish without destroying shared GPU resources early?

**YES** — dispose only on asset unload.

> Can a non-Three plugin define an asset type via public APIs?

**YES** — `defineAssetType` + `registerLoader` (JsonAsset / FakeAsset prove it).

> If Three asset integration were deleted, would `@mob3/assets` remain coherent?

**YES.**
