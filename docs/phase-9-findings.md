# Phase 9 Findings — World Model & DX

## Hierarchy representation

**Canonical:** `Parent` on the child.  
**Secondary:** `Children.list` on the parent, maintained exclusively by World (`setParent` / `removeParent` / despawn).

Developers do not hand-edit both. Invariants are owned by mob3. No generic `Relation<T>` / graph framework was required — Parent/Children as a narrow API was sufficient.

## Reparent semantics

```ts
world.setParent(child, parent, { preserve: "local" | "global" })
```

Default: **`preserve: "local"`** — cheap, predictable; world pose may jump.  
`preserve: "global"` recomputes local TRS from current `GlobalTransform` so the entity stays put.

## Despawn semantics

```ts
world.despawn(entity, { hierarchy: "cascade" | "detach" })
```

Default: **`cascade`** — entire subtree.  
`detach` — children become roots (keep local Transform).

## Transform model

- `Transform` — local TRS (existing fields: translation, Euler rx/ry/rz, scale)
- `GlobalTransform` — derived world TRS, same field shape for DX
- Propagation: iterative BFS, parent before child (PostUpdate `transformPropagation`)
- Matrices used internally for multiply/invert; not forced into the public API
- `GlobalTransform` is overwritten by propagation; users write `Transform` via `getMut`

## Change detection

- `world.beginFrame()` advances a monotonic tick (App does this each update)
- Per-(entity, componentType) added/changed ticks
- `world.getMut` / `world.markChanged` — honest mutation signaling
- Query: `.changed(T)` / `.added(T)` match **this frame’s tick**
- Removed: short-lived list (~2 ticks)
- Bare `get` + field write is **not** observed (documented)

## Mutation tracking

| Path | Detected? |
|------|-----------|
| `getMut` / `markChanged` / `set`/`add` | yes |
| bare `get` then mutate fields | **no** |
| worker/WASM shared memory writes | coarse `markStoreChanged(type)` after barrier |

No production Proxies.

## Packed/shared interaction

SharedPackedStorage / WASM shared writes do not set per-row ticks. After parallel/WASM shared batches, ParallelExecutor (and sync WASM) call `markStoreChanged` for written component types → hierarchy treats Transform store as fully dirty that tick. Correct, coarse.

## Three integration

**Flat scene:** Object3Ds stay under Scene; sync applies **GlobalTransform** → position/rotation/scale.  
ECS hierarchy is authoritative. Mirrored Three parenting was rejected to avoid double transforms.  
Change-aware: sync only `.changed(GlobalTransform)` (+ newly added ThreeObject).

## Physics limitations

Dynamic Rapier bodies **must be hierarchy roots**. `enforceDynamicBodyRoots` throws if a dynamic body has `Parent`. Kinematic/fixed parenting left unrestricted for Phase 9. Dynamic reads use `getMut(Transform)` so hierarchy/Three see updates.

## Query ergonomics

`.changed()` / `.added()` / `.with()` / `.without()` covered Hierarchy Lab and sync systems. Prepared/reusable query objects were **not** shipped — not clearly better than composing filters at the call site.

## Performance

`npm run bench:hierarchy` (leaf-biased mutations; dirty subtree propagation):

| shape | ents | chg% | propMs | chgGlob |
|-------|------|------|--------|---------|
| balanced | 1k | 1% | 0.016 | 5 |
| balanced | 1k | 100% | 0.437 | 500 |
| balanced | 100k | 1% | 0.642 | 500 |
| balanced | 100k | 100% | 75.5 | 50k |
| wide | 100k | 1% | 1.24 | 999 |
| wide | 100k | 100% | 143 | 100k |
| deep | 10k | leaf | ~0.003 | 1 |

Change tracking overhead (`getMut` vs bare `get`, 100k): ~13ms vs ~5ms per full scan — real cost, justified when selective consumers skip work.

Dirty propagation pays off strongly at low change rates (100k balanced 1% ≪ 100%).

## DX pain

- Must remember `getMut` (JS will not save you)
- Euler locals + matrix globals can surprise under `preserve: "global"` with non-uniform scale
- App-state machines were not needed for Hierarchy Lab; pause was a boolean — future phase if menus/loading become painful
- Numeric entity IDs still need `Name` for readable trees (`formatHierarchy` helps)

## Breaking / pre-0.1 notes

- Three sync now prefers `GlobalTransform` (Transform-only fallback remains)
- Despawn default is cascade (was previously single-entity with no hierarchy policy)
- Dynamic body + Parent is now an error

## Architectural answers

> If Three.js disappeared, would hierarchy and global transforms remain fully meaningful?

**YES.** Headless Hierarchy Lab + tests prove it.

> Does a developer manipulate hierarchy through mob3 concepts rather than manually keeping Parent, Children, Transform, and Three.Object3D consistent?

**YES** — via `setParent` / `spawnChild` / despawn policies + automatic propagation + flat Three sync.

> Did hierarchy force a generic relationship engine?

**NO.**

> Did change detection make ordinary systems meaningfully more selective without making access unpleasant?

**YES for selective workloads** (Three sync, dirty propagation). `getMut` is a small tax; bare mutation silence is the honest tradeoff. Keep the API.
