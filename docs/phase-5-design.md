# Phase 5 Design — Parallel Execution

## Question

> Can mob3 execute systems the planner has proven independent **concurrently**, while preserving sequential observable semantics?

Correctness before speed. Sequential remains the reference.

## 1. Current storage (Phase 4)

- Components: sparse `Map<ComponentType, Map<Entity, unknown>>` — not archetypes
- Resources / events: Maps on `World`
- Entities: packed generational `number`
- Commands: shared buffer, flushed **after each system** sequentially
- `ExecutionPlan.batches`: informational; executor still sequential

## 2. What can cross a worker boundary

| Can transfer | Cannot |
| --- | --- |
| numbers, booleans, plain numeric records | Three Object3D, DOM, Rapier handles |
| TypedArrays / structured-clone-safe POJOs | functions, class instances with methods |
| declared resource snapshots that are clone-safe | arbitrary closures / `World` itself |

**Not** transferring: the World, Commands API, or system closures.

## 3. Worker communication model

Reusable **worker pool** (browser `Worker` / Node `worker_threads`).

Protocol:

1. Main extracts a **job payload** from declared access (component slices + resource snapshots)
2. Post to idle worker (`module` URL + `export` name + payload)
3. Worker `import()`s the module, runs the named export, returns write slices (+ optional events)
4. Main validates declared writes, commits at barrier in plan order

No `Function.toString` / `eval` / `new Function`.

## 4. Execution eligibility

Separate from ECS conflict analysis:

| Kind | Affinity | Notes |
| --- | --- | --- |
| opaque `SystemFn` | **main** | always |
| `system({...})` | **main** | analyzable, not worker-relocatable |
| `workerSystem({...})` | **parallel-eligible** | module-addressable + transfer codecs |
| `commands: true` | **main** | no parallel structural mutation in Phase 5 |
| Three / Input / Rapier | **main** | thread-affine integrations |

Default: conservative. Opt-in only via `workerSystem`.

## 5. Mutation semantics

Within a parallel batch:

- Each system sees a **snapshot** of inputs from batch start
- Worker writes do **not** leak to sibling systems in the same batch
- At barrier: validate → commit writes in **ExecutionPlan order** → then next batch

Equivalent to sequential for independent declared access.

## 6. Commands / events

- **Commands:** worker systems forbid `commands: true`; command systems stay main
- **Events:** workers may return event payloads; main merges in plan order at barrier (not completion order)

## 7. Barrier

```
batch start
  → extract inputs (worker jobs) + run main jobs concurrently with dispatches
  → await all
  → validate results
  → commit writes (plan order) + merge events
  → (no Commands from workers)
  → next batch
```

Failed batch: **no commit** (all-or-nothing for that batch’s worker writes).

## 8. Fallback

- Mode `preferred` (default): workers unavailable → run worker handlers on main via same extract/apply path
- Mode `required`: fail clearly if Workers unavailable

## 9. Expected overhead

Floor = dispatch + structured clone/copy + scheduling + commit.

Expect wins only when system work ≫ copy cost. Measure crossover; SharedArrayBuffer is **optional spike only** if copy dominates.

## 10. Async API

Parallel execution is async. Preserve sync `app.update()` for sequential.

Add `await app.updateAsync(dt)` when a parallel executor is active.
Browser runner awaits frame completion; no overlapping frames.

## 11. Non-goals

Shared-memory ECS rewrite, closure serialization, parallel Three/DOM/Rapier,
parallel Commands, WASM, job stealing, network workers.
