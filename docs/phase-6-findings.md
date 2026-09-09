# Phase 6 Findings — Storage Architecture

## Verdict

mob3 can choose physical storage per component type without changing the ECS
programming model. **Local PackedStorage** works with existing `query` /
Commands / mixed object+tag components. **SharedPackedStorage** eliminates the
Phase 5 copy cliff for worker batches: transfer drops from hundreds of ms to
single-digit ms at 100k entities, and parallel shared beats parallel copy by
~2–5× in this environment.

Object storage remains the default. Shared is opt-in and fixed-capacity.

## API

```ts
import { packedComponent, f32 } from "mob3";

const Transform = packedComponent(
  { x: f32, y: f32, z: f32 },
  { name: "Transform" },
);

const SharedPos = packedComponent(
  { x: f32, y: f32, z: f32 },
  { name: "Position", shared: true, capacity: 100_000 },
);
```

Views from `world.get` / `query` are **write-through** and **not identity-stable**.
Object components keep persistent identity.

Worker systems: `dataPath: "auto" | "copy" | "shared"` on the parallel executor.
Auto uses SAB when all accessed data components are SharedPackedStorage.

## Semantics

| Topic | Decision |
| --- | --- |
| Tags | unchanged (object sentinel) |
| Mixed queries | packed + object + tag — tested |
| Commands | identical flush semantics |
| Deletion | swap-remove + map fixup; churn stress OK |
| Shared capacity | fixed; clear error when exceeded |
| Structural mutation | main-thread only |
| Batch isolation | still component-level conflicts (no row parallelism) |
| Visibility | worker message barrier; no per-field atomics |

## Main-thread Object vs Packed

Spawn: packed ≈ object (slightly faster at 100k).

Query mutation via ephemeral views: **object often similar or faster** — view
getter/setter overhead offsets SoA benefits for simple main-thread loops.
Packed SoA is still the right substrate for shared workers and future column
APIs (`forEachSlot` / direct columns) without lying about view cost.

Memory (payload estimate, 100k × 6 f32 fields): packed ~2.4MB vs object ~4.8MB
numbers alone — plus Map/index overhead unlabeled.

Churn (100k, 50% despawn/respawn × 20): ~1.6s; store size stays bounded.

## Parallel matrix (independent force+heat+wobble, 2 workers)

| Ents | Work | seq packed | par copy | par shared | shared vs copy |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10k | 40 | 6.5 ms | 33 ms (xfer 22) | **6.2 ms** (xfer 0.5) | **5.4×** |
| 10k | 200 | 51 ms | 52 ms | **25 ms** | **2.1×** |
| 50k | 40 | 67 ms | 206 ms (xfer 140) | **40 ms** (xfer 4) | **5.2×** |
| 100k | 40 | 135 ms | 447 ms (xfer 308) | **83 ms** (xfer 7) | **5.4×** |
| 100k | 800 | 1972 ms | 2314 ms | **1236 ms** | **1.9×** |

Shared **commit ≈ 0** (mutations already in SAB). Copy commit remains large.

**Phase 5 cliff:** at 50k–100k, copy transfer dominated; shared removes that
bottleneck. Parallel shared beats sequential packed when three independent
systems share a batch (~1.2–2.1× here).

## When to use what

| Path | Use |
| --- | --- |
| Object | default; Three/Rapier/DOM/arbitrary JS |
| Packed (local) | numeric schemas; prep for shared; column iteration later |
| Parallel copy | non-shared numeric / SAB unavailable |
| Parallel shared | large numeric worlds + independent worker systems |

## Non-goals (kept)

Live Object→Packed migration, serialization, row-level parallelism, parallel
Commands, locks on field access, browser COOP/COEP baked into core
(`sharedArrayBufferAvailable()` + docs only).

## Artifacts

- `npm run bench:storage`
- Tests: packed churn/mixed/Commands; shared parallel determinism
- Design: `docs/phase-6-design.md`
