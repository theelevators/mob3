# Phase 6 Design — Storage Architecture

## Question

> Can mob3 support alternative physical component storage without changing the ECS programming model — and can shared packed storage eliminate Phase 5’s worker copy cliff?

Storage experiment first. SharedArrayBuffer only after local packed is measured.

## 1. Current storage (Phase 5)

- Per type: `Map<Entity, unknown>` (object storage)
- Reverse index: `entity → Set<ComponentType>`
- Query: drive from smallest store; `get` returns object references
- Phase 5 workers: extract TypedArray copies → worker → commit copies

## 2. Query hot path

`Query` picks smallest `componentStoreSize`, filters with `has`, yields `[entity, ...get()]`.
Object identity: `get` returns the stored object (`a === b` for object storage).

## 3. Phase 5 copy path

extract → structured-clone TypedArrays → worker → validate → commit field-by-field.
Dominates at ≥50k entities.

## 4. Storage abstraction

```
ComponentType → ComponentStorage
  ├── ObjectStorage      (default)
  ├── PackedStorage      (opt-in, ArrayBuffer)
  └── SharedPackedStorage (opt-in, SharedArrayBuffer)
```

Minimal ops: `has`, `getView`, `setFromObject`, `remove`, `size`, `entities`, `clear`.

## 5. Packed representation

SoA: per-field TypedArrays + `entity→slot` + `slot→entity`.
Swap-remove on delete. Grow by doubling (local packed).
Generational entities unchanged; slots ≠ entity indices.

## 6. Shared representation

Same SoA layout over `SharedArrayBuffer`. **Fixed capacity** (explicit; fail if exceeded).
No resize under active workers. Structural mutation main-thread only.

## 7–9. Mapping / growth / deletion

- Insert: allocate slot (free list or dense push)
- Delete: swap-remove with last; update maps
- Grow (local only): realloc TypedArrays
- Shared: fixed capacity from construction

## 10. API compatibility

`spawn(Transform({x}))`, `query`, Commands unchanged.
Object components untouched (ThreeObject, Rapier, etc.).

## 11. Ergonomics / identity

Packed `get` / query rows return **ephemeral write-through views**.
**Not** identity-stable (`get` twice may not be `===`).
Views valid until next structural mutation of that store.
Optional `forEachPacked` / column API for hot paths without per-row alloc.

## 12. Worker visibility

Shared path: worker receives descriptors (SharedArrayBuffer + field views) for
**declared** stores only. Barrier = worker message completion (no per-field atomics).
Component-level conflicts still serialize (no row-level parallelism).
Copy path retained for non-shared / unavailable SAB.

## Rollout

1. Baseline benches (object + Phase 5 copy)
2. PackedStorage + `packedComponent` + mixed queries
3. Measure main-thread Object vs Packed
4. SharedPackedStorage + parallel-shared path
5. Matrix + findings
