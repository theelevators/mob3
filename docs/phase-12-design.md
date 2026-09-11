# Phase 12 Design — DX from Real Apps (BoxClub + msh-up)

## Why

Two real migrations validated the architecture and exposed the same setup tax:

- BoxClub: better than R3F for a 60fps fight loop; worse install/typing
- msh-up: stem→entity is the right bet; Node leaks + Transform dirty footgun hurt day one

See `docs/boxclub-migration-feedback.md` and `docs/msh-up-migration-feedback.md`.

## Goals (this slice)

1. **Browser-safe default entry** — `import … from "@mob3/core"` must not pull `node:` workers/wasm loaders
2. **Spawn typing** — `world.spawn(Transform(), ThreeObject(mesh))` without `as never`
3. **Auto-dirty Transform helpers** — `setTranslation` / `setScale` / `world.mutate`
4. **`syncMode: "always"`** on `ThreePlugin` for small scenes
5. **Subpath exports** — `@mob3/core/parallel`, `@mob3/core/node`, `@mob3/three/plugin` | `/gltf` | `/animation`
6. **Cookbook docs** — React canvas, audio visualizer sketch, minimal scene

## Non-goals

- Replacing Three mesh/material authoring
- Animation graphs / IK
- Full npm publish automation (document install path; publish when ready)
- Heavy React framework (thin hook + docs first)

## Authority unchanged

ECS still owns world state; Three owns renderer-local objects. DX changes must not blur that split.

## Exit criteria

- Vite/Turbopack consumer can depend on `mob3` + `@mob3/three/plugin` without `node:` stubs
- Spawn of branded component instances typechecks
- Mutating scale via helper marks Transform dirty and syncs under default change detection
- `syncMode: "always"` syncs even after silent `get()` field writes
- Cookbooks exist for React canvas + minimal ThreePlugin scene
