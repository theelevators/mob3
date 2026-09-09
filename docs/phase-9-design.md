# Phase 9 Design — World Model & DX

## Question

> Is mob3 pleasant for representing and manipulating a real hierarchical 3D world?

No new execution backends. Hierarchy + transforms + change detection + Three sync.

## 1. Hierarchy ownership

ECS is authoritative. Three scene graph is **not** required for correctness.

**Canonical:** `Parent` component on the child.

**Secondary:** `Children` component on the parent (entity list), maintained by World APIs.

Developers must use `world.setParent` / `commands.setParent` — not hand-edit Parent/Children inconsistently.

## 2–5. Representation & safety

- One parent per entity; roots have no Parent
- Cycle / self-parent rejected at mutation time
- Dead/stale parent rejected
- `world.validateHierarchy()` for tests/debug

## 6. Reparent

```ts
world.setParent(child, parent, { preserve: "local" | "global" })
```

Default: **`preserve: "local"`** (world pose may jump — predictable, cheap).

`preserve: "global"` recomputes local TRS so GlobalTransform stays put.

## 7. Despawn

```ts
world.despawn(entity, { hierarchy: "cascade" | "detach" })
```

Default: **`cascade`** (despawn entire subtree).

`detach` orphans children as roots (keep local Transform).

## 8–11. Transform model

- `Transform` — local TRS (existing fields: x,y,z, rx,ry,rz, sx,sy,sz)
- `GlobalTransform` — derived world TRS (same field shape for DX)

Propagation (PostUpdate, sequential):

roots → children → … iterative BFS/stack (no recursion catastrophe)

`GlobalTransform` overwritten by propagation; users write `Transform`.

## 12–13. Dirty propagation

Mark subtree dirty on local Transform / Parent change / reparent.
Propagation walks dirty roots’ descendants only when possible.
Full pass fallback if dirty set is huge / first frame.

## 14–17. Change detection

- `World.changeTick` advances once per schedule system flush boundary (and frame)
- Per `(entity, componentType)` last-changed tick
- `world.getMut(entity, T)` / `world.markChanged(entity, T)`
- Query: `.changed(T)` / `.added(T)`
- Removed: short-lived removed list for current tick (best-effort)
- Packed: parallel u32 tick column / side map keyed by entity
- No production proxies

Honesty: bare `world.get` + field mutate does **not** auto-mark. Use `getMut`.

## Off-main (worker/WASM)

Conservative: systems with write access to Transform after barrier call
`markStoreChanged(Transform)` or propagation dirties from write set.
Fine-grained WASM dirty bits deferred.

## 21–22. Three sync

**Flat scene:** Object3Ds stay under Scene; sync **GlobalTransform** → Object3D.
No mirrored ECS→Three parenting (avoids double transform).
Change-aware: sync only `.changed(GlobalTransform)` (+ added ThreeObject).

## Physics

Dynamic Rapier bodies: prefer roots for Phase 9; parented dynamics rejected or warned.

## Non-goals

Generic relations, prefabs, assets, animation, editor, parallel hierarchy, WASM hierarchy.
