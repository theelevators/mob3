# Phase 4 Design — Execution Graph

## Question

> Can mob3 understand what systems access, derive an execution plan, explain that plan, and detect unsafe/ambiguous scheduling relationships — while remaining single-threaded?

## 1. Current scheduler (Phase 3)

- `Schedule` stores `SystemEntry { system, before[], after[] }` per label
- Topological sort by function identity; registration order breaks ties
- `run` executes sequentially and flushes Commands after each system
- No access metadata, no plan object, no timings

## 2. System identity

| Kind | Identity |
| --- | --- |
| `system({ name, access, run })` | Stable `SystemId` (symbol) + name + access |
| Plain `SystemFn` | Opaque: function identity as key; name from `fn.name` or `"anonymous"` |

`addSystem` accepts either. Descriptors are callable (`SystemFn`) so existing APIs stay valid.

## 3. Access metadata

```ts
system({
  name: "movement",
  access: {
    read: [Velocity],
    write: [Transform],
    resources: { read: [Time] },
    commands: false,
    events: { read: [], write: [] },
  },
  run(world, commands) { ... },
});
```

Internally keep components vs resources vs events vs `commands` distinct.

**Undeclared / plain systems = opaque** → treated as conflicting with all for batching (conservative).

## 4. Conflict rules

- read∩read → compatible
- read∩write, write∩read, write∩write → conflict (same component/resource/event type)
- `commands: true` ↔ `commands: true` → conflict (structural mutation marker)
- opaque ↔ anything → conflict
- Different types → no access conflict

**Conflict ≠ dependency.** Conflicts are recorded; they do not invent ordering. Explicit `before`/`after` remains authoritative. Unordered conflicts → diagnostic only (unless strict mode).

## 5. Graph & plan

```
SystemDescriptor[]
  → dependency edges (explicit order)
  → conflict pairs (access analysis)
  → topo order (deps + registration tie-break)
  → theoretical batches (conservative)
  → ExecutionPlan
```

Compile when schedule dirty; reuse each tick.

## 6. Sequential executor

Phase 4 still runs systems one-by-one in compiled order. Batches are informational for Phase 5.

Determinism: same registration + constraints → same order as Phase 3 topo sort (access analysis must not reorder).

## 7. Validation

- **Default:** trust declarations; no hot-path checks
- **`app.enableDiagnostics({ validateAccess: true })`:** while a declared system runs, `get`/`resource`/`query` check declared access (structural call sites only — mutating a read `get` result is undetectable without proxies; we document that honesty contract)
- No production proxies

## 8. Instrumentation

`app.enableDiagnostics()` records per-system timings (count, total, last, avg). Disabled by default.

## 9. Inspector

`app.inspectSchedule(label)` → structured `ExecutionPlan`  
`formatExecutionPlan(plan)` → text report  
JSON export via example (not core viz deps)

## 10. Events & Commands

- Event read/write tracked like resource keys (by `EventType` identity)
- `commands: true` marks structural mutation; serializes against other command systems in batching

## 11. Non-goals

Workers, SharedArrayBuffer, parallel mutation, Bevy-scale query descriptors (defer unless Mob Arena proves duplication painful).
