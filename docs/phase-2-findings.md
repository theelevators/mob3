# Phase 2 Findings — Prove the Architecture

Environment: Node v22, Linux cloud agent VM. Measurements from `npm test`, `npm run example:arena:headless`, `npm run bench:mixed` (2026-09-09).

## Question

> If Three.js disappeared tomorrow, would the underlying world still make sense?

**Yes.** Mob Arena’s gameplay (`createGame`, components, systems) imports only `mob3`. Headless runs 10 000 ticks with seeded RNG and no `three` / `@mob3/three`. Browser adds meshes as optional `ThreeObject` components.

---

## APIs that felt good

- **`component()` / `tag()` + `world.spawn(...)`** — low ceremony; tags as bare identifiers in bundles read well.
- **`world.query(A, B).with(T).without(U)`** — filtering matched how systems think; inference held without casts in arena code.
- **Resources for Input / Score / SpawnConfig / Random / GameMeta** — multiple independent worlds are natural; no module globals.
- **`app.update(dt)` headless** — fixed timestep + scripted input made determinism tests straightforward.
- **Explicit `SystemFn = (world, commands) => void`** — better than inventing DI; ignoring `commands` when unused is fine.

## APIs that felt awkward (and what we changed)

### 1. Transform lived in `@mob3/three`

Headless could not share the same Transform type without importing a Three package.

**Fix:** Moved `Transform` into `mob3` core. `@mob3/three` re-exports it and syncs `Transform` + `ThreeObject` only.

### 2. Immediate spawn/despawn during queries

Death while iterating would be unsafe / order-dependent.

**Fix:** Introduced `Commands` with flush **after each system**.

### 3. Stale entity IDs after recycle

Holding `GameMeta.player` across frames is required; recycled indices without generations are footguns.

**Fix:** Generational packed entity IDs (`index` + `generation`). Stale handles fail `isAlive` / `get`.

### 4. `Time.delta` during FixedUpdate

Simulation systems read `Time.delta`; it was the frame delta, so fixed step was a lie.

**Fix:** During each FixedUpdate step, `Time.delta === Time.fixedDelta`.

### 5. Events × multiple FixedUpdate steps

Clearing only at end of `App.update` caused DamageEvents to re-apply on later fixed steps in the same frame.

**Fix:** Clear events at the **start** of each FixedUpdate step; clear again at end of frame so Update can still observe the last FixedUpdate’s events (e.g. `DeathEvent` for tooling).

### 6. Despawn vs Three mesh ownership

`commands.despawn` removed ECS data but left `Object3D` in the scene.

**Fix (application pattern, not a Three-coupled core hook):** `PendingDespawn` tag → optional view cleanup → `despawnPending` system. Browser sets `autoDespawn: false` and inserts mesh detach before despawn. Documented as intentional separation; a future `RemovedComponents` query would reduce this boilerplate.

### 7. System ordering is registration order only

Browser needed mesh detach immediately before despawn. Without schedule graph APIs, we used `autoDespawn` + append order.

**Proposal:** Keep boring for now; add `.before`/`.after` only when a second game forces it.

## Workarounds discovered (= framework debt)

| Workaround | Defect |
| --- | --- |
| `PendingDespawn` + runner-owned despawn | No removed-component / despawn observer |
| `autoDespawn: false` for browser | No schedule insertion API |
| Collision `.collect()` snapshots | Live iteration + deferred commands still allocate when many pairs |
| `for...of` query rows allocate tuples | Hot path GC; added `query.forEach` but arena still uses `for...of` |

## Performance observations

Mixed world (100k Transform / 80k Velocity / 40k Health / 20k Enemy / 10k Lifetime / 1k Renderable):

| Op | Median |
| --- | --- |
| spawn mixed 100k | ~178 ms |
| query(Transform) 100k | ~18 ms |
| query(Transform, Velocity) 80k | ~22 ms |
| query(Transform, Velocity).with(Enemy) 20k | ~18 ms |
| query Renderable 1k | ~10 ms |
| add/remove on 10k | ~11 ms |
| one sim tick (move + enemy touch + 1k “sync”) | ~197 ms |

**Takeaway:** Querying 1k renderables is cheaper than full 100k scans; **ECS population ≠ draw list** works. Map-of-Maps is fine for validating architecture; not for 100k @ 60 Hz without storage work (Phase 6).

Headless Mob Arena 10 000 ticks (seed 42, scripted input): completes in ~1–2 s in tests; sample result `kills: 5`, `enemyCount: 40`, `playerHealth ≈ 62`.

## Allocation pressure

- Each `for (const [e, ...] of query)` allocates a row array — dominant iterator cost.
- `collision` uses `.collect()` (intentional snapshot).
- Commands allocate op objects per mutation — acceptable at arena scale.
- `query.forEach` reduces tuple alloc but still maps component arrays today — not zero-alloc yet.

No SoA rewrite this phase.

## TypeScript pain

- Query inference worked for arena systems without `any`.
- Tag-only `world.query(Enemy)` works.
- `ThreeObject` dual call signature (`mesh` vs `{ object }`) is slightly complex but usable.
- Compiling examples against source aliases avoids publish-cycle friction in the workspace.

## Scheduler observations

- Putting gameplay in `FixedUpdate` and HUD/input edges in `Update` felt natural.
- Registration order is load-bearing; document it until ordering constraints exist.
- Fixed step isolation (delta + event clear) was necessary once combat used events.

## Three integration observations

- Simulation systems have **zero** Three imports.
- Entities without `ThreeObject` simulate normally (enemies exist headless; browser attaches meshes later).
- Sync remains one-way ECS → Three.
- Mesh lifecycle required an explicit app pattern (`PendingDespawn`); core correctly stayed renderer-agnostic.

## Entity lifecycle decision

Generational IDs **were** required: Mob Arena stores `player` in a resource and despawns many entities. Implemented packed `Entity` with generation bits.

## Event decision

Existing `event()` API was enough (`DamageEvent`, `DeathEvent`). No pub/sub framework. Lifetime documented above.

## Proposed breaking changes (done in this phase)

1. `SystemFn` is now `(world, commands) => void`.
2. `Transform` moves to `mob3` (re-exported from `@mob3/three`).
3. Entity IDs are generational (numeric values change meaning vs v0.1 plain indices).
4. Event clearing semantics relative to FixedUpdate (see above).

## What we did **not** add

Rapier, workers, netcode, prefabs, editors, archetypes — none were required to answer the Phase 2 question.

## Verdict

mob3’s abstractions survived a small real game with pressure on commands, events, fixed timestep, headless determinism, and optional rendering. The remaining sharp edge is **despawn ↔ view object lifecycle**; prefer a future generic removed/despawn observation API over coupling core to Three.
