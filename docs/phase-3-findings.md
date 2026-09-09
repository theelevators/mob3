# Phase 3 Findings — Ecosystem Boundary

Environment: Node v22, Linux cloud agent. Measurements 2026-09-09 (Phase 3 session).

## Architectural question

> Could an independent developer build `@someone/mob3-whatever` using only mob3's public API?

**Yes — with the public surface as of this phase:** `App.addPlugin` / `addSystem` / `order` / `insertResource` / `onDispose` / `dispose`, plus `World`, `Commands`, `PendingDespawn`, `Transform`, events, and schedule labels. `@mob3/input`, `@mob3/rapier`, and `@mob3/three` use only those APIs (no core internals).

## Plugin API

**Changed:**

- `Plugin.dispose?(app)` optional cleanup
- `app.onDispose(fn)` for ad-hoc teardown
- `app.dispose()` — stop runner, dispose plugins (reverse order), run hooks; **idempotent**
- `app.order(label, system, { before|after })` + `addSystem(..., constraints)` with topological sort

**Why:** DOM listeners, Rapier worlds, and Three renderers need owned cleanup; physics needs ordering relative to gameplay without hard-coding Rapier into core schedules.

## Lifecycle

Hooks that proved necessary:

1. `build`
2. `dispose` / `onDispose`
3. Systems observing `PendingDespawn` (promoted to **core**)

Not needed: async plugin ready gates, multi-phase finish/cleanup like Bevy (yet).

**Ownership rule:** plugin-created objects are disposed by the plugin; caller-supplied Three renderer is not.

## Input

`@mob3/input`:

- `Input` resource: `pressed` / `justPressed` / `justReleased` / `setPressed`
- `InputPlugin` — DOM adapter
- `SyntheticInputPlugin` + `setInputMap` / `applyInput` — headless

**Transients:** frame-scoped; cleared in `PostRender`. With `update(1/60)` and `fixedDelta=1/60` (one FixedUpdate/frame), edges align with simulation. Multiple FixedUpdates per rendered frame can see the same `justPressed` — documented caveat; arena uses that cadence in tests.

Gameplay no longer touches `window` / `KeyboardEvent`.

## Physics

`@mob3/rapier` (requires `await initRapier()`):

- `PhysicsWorld` resource
- `RigidBody` + `PhysicsCollider` intent components
- Systems: ensure bodies → write kinematics → step → read dynamics → collision events → cleanup `PendingDespawn`
- `CollisionStarted` with `Entity` pairs

Rapier remains accessible via `PhysicsWorld.world` / exported `RAPIER` when needed.

**Kinematic–kinematic:** enabled via `ActiveCollisionTypes` (default Rapier config skipped these; arena would not deal damage otherwise).

## Transform authority

| Kind | Chain |
| --- | --- |
| No physics | Gameplay → Transform → Renderer |
| `kinematicPosition` | Gameplay → Transform → Rapier write |
| `dynamic` | Rapier step → Transform → Renderer |
| `fixed` | Set at body creation |

No bidirectional sync. Arena uses kinematic bodies for player/enemy/projectile.

## Scheduler

Registration order alone failed once physics entered. Minimal **before/after by function identity** + topo sort was enough. No Bevy-scale schedule graph.

Awkward: constraining a system registered by another plugin requires importing that system function (`cleanupPhysicsBodies`, `writeKinematicTransforms`). Acceptable for composition; a future labeled system-set API could soften this.

## Rendering

| Frontend | Composition |
| --- | --- |
| Three | Input + Rapier + Three + MobArena |
| Canvas 2D | Input + Rapier + DebugCanvas + MobArena |
| Headless | SyntheticInput + Rapier + MobArena |

Gameplay (`MobArenaPlugin`) has **no** Three/DOM imports. Canvas example lives under `examples/debug-canvas` (intentionally not a polished package).

## Headless

Phase 2 guarantee **survives**. `npm run example:arena:headless` — 10k ticks, seed 42, sample: `kills: 5`, `enemyCount: 40`, no `three` import.

Determinism: same seed + synthetic input → equal snapshots (tested 2×2000 ticks). Physics determinism claimed only for same runtime/build (Rapier compat), not cross-platform bit-identical.

## Core contamination audit

`packages/core/src` contains no Three/Rapier/DOM/Canvas/Keyboard concepts.

**Intentional core additions:**

- `Transform` (world state)
- `PendingDespawn` (lifecycle signal for any integration)

## Performance (qualitative)

- Headless 10k ticks with Rapier: a few seconds on the agent VM (dominated by physics step vs Phase 2 pure ECS).
- Disposal ×50 short runs: no throws; body counts stay bounded under churn test (`bodies < 80` after 600 ticks).

No FPS marketing numbers.

## Awkward APIs / remaining debt

1. Importing peer plugin system fns for `.before/.after` coupling
2. `justPressed` across multiple FixedUpdates in one frame
3. `initRapier()` async gate before plugin add
4. Mesh attach still app-side for Three (optional `ThreeObject`) — fine architecturally, noisy in browser.ts
5. Debug canvas uses example-relative imports of Mob Arena (workspace demo, not published)

## Breaking changes (this phase)

1. `PendingDespawn` moved to `mob3` core (arena re-exports)
2. Arena `Input` resource replaced by `@mob3/input`
3. Hand-rolled circle collision replaced by Rapier events
4. `App.dispose()` added; disposed apps reject `update`/`run`
5. System ordering API (`before`/`after`/`order`)

## Verdict

Independent capabilities compose around mob3 without core coupling. Three is optional; Canvas and headless prove the renderer is replaceable; Rapier owns physics objects without owning the application model; input is an ECS resource with a DOM adapter — not a gameplay dependency.

> Could someone ship `@someone/mob3-whatever` on public APIs only? **Yes.**
