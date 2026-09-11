# msh-up Migration Feedback

Honest notes from adopting mob3 on an interactive audio/visual stage (stems → entities).

## What mob3 got right

- **Stems as entities** — `StemTag` / `StemVisual` / `Transform` / `ThreeObject` stays readable as the stage grows
- **Mix state as a resource** — clear ownership vs scattering audio state through React
- **Update systems** for sync + animation — maps well to “audio state → visual entities”

## Day-one pain

1. **Not on npm** → vendor + rebuild
2. **Node parallel/wasm paths leaked into the client bundle** → Turbopack patches
3. **In-place `Transform` mutation doesn’t dirty** → pillars looked dead until `getMut` / `markChanged` / hierarchy dirty
4. **Spawn typing** needed `as never` for bundle items
5. **React lifecycle is on you** — Strict Mode remount, canvas size at mount, dispose

## Would we recommend it?

| Situation | Recommendation |
|-----------|----------------|
| Real interactive stage (many stems/FX/agents, systems you’ll keep adding) | **Yes** |
| One-off hero visual; team doesn’t know ECS | **No / not yet** |
| msh-up specifically | **Keep mob3** — stem→entity is the right long-term bet |

## Improvements requested (→ Phase 12 DX)

1. Publish npm packages with a **browser-safe exports map** that never pulls Node worker/wasm into client bundles
2. **Mutable Transform helpers** that auto-dirty (`setScale`, `mutate`, …)
3. First-class **React/Next adapter** — `useMob3App(canvas, plugins)` with resize, Strict Mode, dispose
4. **Better spawn DX** — typed `world.spawn(Transform(), ThreeObject(mesh))` without casts
5. Docs cookbook: audio visualizer, canvas in React, minimal ThreePlugin scene
6. Optional **always-sync** mode for small scenes (skip change-detection footgun)
7. Tree-shakeable entrypoints (`mob3` browser, `@mob3/core/parallel`, `@mob3/three/plugin`, …)

## Bottom line for other devs

Learn Three first; adopt mob3 when object count + systems start to hurt. It’s promising ECS glue, not a Three replacement — polish browser packaging and the mutation/dirty story and it becomes an easy yes for product work like this.
