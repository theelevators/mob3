# Phase 5 Findings — Parallel Execution

## Verdict

mob3 can execute planner-proven independent systems concurrently via a
**copy-based** worker pool, preserving sequential semantics (barriers, plan-order
commits, completion-order independence).

For realistic numeric workloads, **parallel wins only in a mid band** where
compute ≫ extract/copy/commit. At large entity counts, copying dominates and
parallel is neutral-to-slower. That is a successful Phase 5 result: semantics
work; SharedArrayBuffer-style storage is now evidence-justified for Phase 6 —
not assumed.

Sequential `app.update()` remains the reference implementation.

## API

```ts
import { integrate } from "./integrate.js";

const sys = workerSystem({
  name: "integrate",
  module: new URL("./integrate.js", import.meta.url),
  export: "integrate",
  run: integrate, // main binding of the same module
  access: {
    read: [Velocity],
    write: [Position],
    resources: { read: [Time] },
  },
});

const app = new App({ parallel: { workers: 4, mode: "preferred" } });
app.addSystem(FixedUpdate, sys);
await app.updateAsync(1 / 60);
```

Progressive model:

| API | Affinity |
| --- | --- |
| plain `SystemFn` | main (opaque) |
| `system({...})` | main (declared) |
| `workerSystem({...})` | parallel-eligible |

No closure serialization. Workers `import()` modules.

## Semantics held

- Batch snapshots: sibling systems do not see each other’s in-flight writes
- Commit at barrier in ExecutionPlan order
- Events merged in plan order (torture test with staggered delays)
- Undeclared writes rejected before commit
- Failed batch does not partially commit worker writes
- `dispose()` terminates the pool; recreate loops pass
- Overlapping `updateAsync` frames rejected

## Commands / plugins

- `commands: true` forbidden on `workerSystem` (main only)
- `@mob3/three`, `@mob3/input`, `@mob3/rapier` stay main-thread
- Mob Arena not force-migrated — entity counts are too small; overhead would lose

## Transfer model

Numeric plain-record components only (auto layout from defaults). Tags filter.
Resources: structured-clone snapshots by name. No World shipping.

## Performance (this environment)

Cost floor (~1k ents, trivial damp, 2 workers): **~0.6 ms/tick**

### Conflicting systems (serialized batches)

Expect no speedup — measured S ≈ 0.83–0.97 (overhead only). Honest.

### Independent heat + wobble + force (one batch of 3)

| Entities | Work | Best S (workers) | Notes |
| ---: | ---: | ---: | --- |
| 1k | 200 | ~1.23× (4) | marginal |
| 10k | 200 | **~1.29× (2)** | clear win |
| 10k | 800 | **~1.43× (2)** | best in matrix |
| 50k–100k | 40–800 | ~0.95–1.00× | **copy dominates** |

Crossover: parallel becomes attractive around **~10k entities** with
**medium–expensive** per-entity math; beyond ~50k with this sparse Map + copy
design, workers do not pay for themselves.

Efficiency E = S/workers often ~0.3–0.7 when winning — expected for 3-way batch
on 2–4 workers with extract on main.

## SharedArrayBuffer

**Not implemented.** Measurements say copy cost is the limiter at scale → Phase 6
candidate. Optional spike deferred; evidence is sufficient without contaminating core.

## Demo / benches

- `npm run example:parallel` — Canvas toggle Sequential/Parallel
- `npm run bench:parallel` — matrix above

## Async API

- `update()` — always sequential reference
- `updateAsync()` — parallel batches when executor configured
- Browser runner awaits frames; no overlap

Fallback `mode: "preferred"` runs handlers on main if Workers unavailable.

## Non-goals (kept)

Shared-memory ECS rewrite, closure eval, parallel Commands/Three/DOM/Rapier,
WASM, job stealing, network workers.
