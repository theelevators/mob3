# Phase 4 Findings — Execution Graph

## Verdict

mob3 can attach access metadata to systems, compile an inspectable execution
plan (dependencies, conflicts, theoretical batches), and run that plan
**sequentially** with Phase 3–equivalent ordering. Plain systems remain valid
as opaque nodes. Determinism holds for Mob Arena headless regression.

## API chosen

```ts
const movement = system({
  name: "movement",
  access: {
    read: [Velocity, Player],
    write: [Transform],
    resources: { read: [Time] },
    events: { read: [], write: [] },
    commands: true,
  },
  run(world, commands) { ... },
});

app.addSystem(FixedUpdate, movement, { before: writeKinematicTransforms });
```

Why this shape:

- One object — readable at call sites, easy for plugins
- Returns a callable `SystemFn` — `before`/`after` keep working by reference
- No decorators / reflection / string component names
- TypeScript infers component/resource/event identities from the arrays

Rejected: dual-arg `system(name, access, fn)` — slightly less self-describing;
decorator styles — ceremony and TS friction.

## Access honesty (TypeScript reality)

Declared access is a **contract**, not a borrow checker.

- `world.get` / query / `resource` call sites can be validated in a future debug
  mode; **mutating a returned object after a read `get` is undetectable** without
  proxies.
- Phase 4 does **not** install production proxies.
- Runtime access validation was deferred: invasive World hot-path changes for
  limited gain once mutation-after-get is admitted. Documented as Phase 4.5 /
  debug-only if needed.
- Trust declarations + optional conflict diagnostics; strict mode for tests.

## Query descriptors

Duplicating query types in `access` vs `world.query(...)` is mildly annoying but
not painful in Mob Arena (~15 systems). **No query-descriptor abstraction** —
boring duplication preferred.

## Opaque systems (intentionally)

| System | Why opaque |
| --- | --- |
| Startup `spawnPlayer` | Immediate `world.spawn` / `insertResource` (not Commands) |
| Browser `setupVisuals` / `attachMeshes` | Immediate `world.add` + Three scene graph |
| Browser / canvas HUD | DOM side effects |

`restartSystem` is declared but also does immediate `world.remove(Dead)` —
noted; prefer Commands for structural ops going forward.

## Events & Commands

- Events tracked like typed keys (read/write conflict rules).
- `commands: true` marks structural mutation; two command systems conflict for
  **batching** (conservative). Today Commands still flush after each system
  sequentially — order is registration/topo order, not batch merge.
- Phase 5 implication: parallel command production needs a merge/flush policy;
  Phase 4 only preserves the marker.

## Conflict ≠ dependency

Unordered write/write (e.g. two Transform writers without `before`/`after`)
produces a diagnostic and stays in registration order. Explicit edges remain
authoritative. Cycles throw with a named path (`A → B → C → A`).

Missing `before`/`after` targets → diagnostic (strict mode → error).

## Batches

Informational only. Conservative: opaque or uncertain → serialize. Arena
FixedUpdate shows many singleton batches around physics/commands — expected.

## Instrumentation

- `app.enableDiagnostics({ timings?, strict? })`
- `app.inspectSchedule(label)` → `ExecutionPlan`
- `formatExecutionPlan(plan)` text report
- `planToJson(plan)` for export (example: `npm run example:arena:inspect`)

### Query match counts

**Deferred.** Accurate per-system match counts need either query instrumentation
or an extra pass. Iteration does not naturally expose “matched N” without
wrapping Query. Not worth hot-path cost for Phase 4.

## Performance (planner bench, this environment)

| Systems | compile | reuse plan | run (instr off) | run (instr on) |
| --- | ---: | ---: | ---: | ---: |
| 10 | ~0.1 ms | ~0 | ~0.003 ms | ~0.01 ms |
| 100 | ~3 ms | ~0 | ~0.04 ms | ~0.06 ms |
| 1000 | ~295 ms | ~0 | ~0.05 ms | ~0.18 ms |

Compile is O(n²) conflict analysis — fine for typical apps; 1k systems is a
planner stress case, not a frame budget. Per-tick overhead with a cached plan
is negligible vs gameplay/physics.

Synthetic 100-system pattern: 25 shared readers share batch 0; 25 shared
writers each force separate batches — matches expectations.

## Mob Arena migration

Gameplay + `@mob3/input` + `@mob3/rapier` + `@mob3/three` systems annotated via
the same public `system()` API. Ordering constraints unchanged. Determinism
test still passes.

## Optional `component(defaults, name?)`

Display names for inspector labels (anonymous factories previously showed as
`factory`). Tags/resources/events already had names.

## Non-goals (still)

Workers, SharedArrayBuffer, parallel mutation, WASM, production borrow proxies.
