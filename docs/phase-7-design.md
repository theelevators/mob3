# Phase 7 Design — Execution ABI

## Question

> Can mob3 describe a system invocation, its allowed data, and its memory layout
> through a small execution contract that does not depend on World, JS closures,
> or a particular executor?

Prove it with **JS workers + in-process twin**. No WASM.

## 1. Current JS worker contract (Phase 6)

- `workerSystem({ module, export, run, access })`
- Shared path: `{ mode:"shared", stores: SharedStoreDescriptor by name, resources }`
- Copy path: `{ components: NumericSlice, resources }`
- Handler returns `{ writes, events? }`
- ParallelExecutor knows worker payload shapes directly

**JS-specific:** string store names, handler dual-mode, World extract on host.

## 2. Which parts are JS-specific

| Concern | JS-specific today | ABI approach |
| --- | --- | --- |
| Module load | `import(url)` | same for JS executor; WASM later uses different loader |
| Memory refs | `SharedArrayBuffer` / `ArrayBuffer` in descriptors | logical FieldMemory; JS transport carries real buffers |
| System body | JS function / object | module-addressable `execute(ctx)` |
| World | not in workers already | still not in ABI |

## 3. Proposed ABI v1

- Descriptor **over** memory — not World serialization
- `ABI_VERSION = 1` integer on every invocation
- Integer IDs stable for App/World lifetime only (not across restarts/apps)
- Schema ≠ memory location
- Capability narrowing from Phase 4 access
- Commands / arbitrary resources / World out of scope
- Events: optional minimal return; unsupported systems stay host-side

## 4. Core types

```
SystemInvocation {
  abiVersion: 1
  system: { id, name }
  execution: { tick, delta, scheduleName }
  access: { reads: StoreId[], writes: StoreId[] }
  stores: StoreInvocation[]  // only declared
  resources: ScalarResource[] // numeric clones only
}

StoreInvocation {
  storeId, componentId, name, generation, count, capacity
  memoryKind: "shared" | "local"
  fields: FieldMemory[]
  entities: Uint32Array  // dense live slots (swap-remove invariant)
}

FieldMemory {
  fieldId, name, type: f32|f64|i32|u32
  buffer, byteOffset, length
}
```

### Component / store / schema identity

- `AbiIdRegistry` assigns monotonic integers per App/executor context
- `storeId === componentId` in v1 (1:1)
- Human names are diagnostics metadata only
- Schema: field id + name + scalar type (Phase 6 packed kinds only)

### Memory descriptors

Separate from schema: buffer + byteOffset + length per field.
Shared → SAB views; local/copy → ArrayBuffer clones (transferable).

### Access capabilities

Invocation includes only declared stores. `AbiContext.read` / `write`
enforce API-level capability checks (not OS memory protection).

## 5. Entity membership

Packed/shared swap-remove ⇒ live rows are dense in `[0, count)`.
`entities: Uint32Array` length `count` carries generational entity ids for
those slots. Executors must not touch `[count, capacity)`.

## 6. Invocation lifecycle

```
build invocation → dispatch → validate ABI version → bind/validate schema
  → execute → ExecutionResult → host barrier → next batch
```

No hidden callbacks, no World, no App back-channel.

### Completion

```
ExecutionResult { abiVersion, systemId, status, events?, localWrites?, diagnostics? }
```

Shared path: fields already mutated — do not return copied stores.
Local/copy: return `localWrites` for host commit.

### Errors

unsupported_version, missing_store, missing_field, schema_mismatch,
type_mismatch, undeclared_access, executor_failure — identify system and
expected vs actual. No silent fallback after contract violation.

### Schema compatibility / layout generation

Bind once per `(systemId, store generations)`. `StoreInvocation.generation`
invalidates cache when storage structure changes. Fixed-capacity shared
storage only bumps generation on structural mutation (spawn/despawn/clear).

## 7. Executors

```
AbiExecutor.execute(invocation) → Promise<ExecutionResult>
```

- `InProcessAbiExecutor` — same descriptors, no World
- `JsWorkerAbiExecutor` / ParallelExecutor ABI path — posts invocation to pool

ParallelExecutor builds ABI invocations for `abiSystem`; legacy `workerSystem`
keeps Phase 5/6 payloads until migrated.

## 8. defineAbiSystem / abiSystem

```ts
export const integrate = defineAbiSystem({
  abiVersion: 1,
  name: "integrate",
  expects: [{ name: "Transform", fields: [...] }],
  execute(ctx) {
    const t = ctx.writeByName("Transform");
    const v = ctx.readByName("Velocity");
    // t.x[i] …
  },
});

app.addSystem(FixedUpdate, abiSystem({
  name: "integrate",
  module: url,
  export: "integrate",
  system: integrate,
  access: { read: [Velocity], write: [Transform] },
}));
```

`AbiContext` is a thin facade over descriptors (columns on the view).
No codegen in Phase 7 — runtime binding is enough; codegen may help WASM
later but is not required to prove the contract.

## 9. Resources / events / commands

- Resources: scalar / structured-clone-safe snapshots only
- Events: optional result batches; host merges in plan order
- Commands: **outside ABI v1** (host / main-thread / fallback)

## 10. Copy path compatibility

`memoryKind: "local" | "shared"` — same system module. Host `dataPath`
auto/copy/shared selects how descriptors are built. Policy stays on the host.

## 11. Non-goals

WASM, binary World blob, Commands ABI, UUID IDs, codegen pipeline,
row-level parallelism, contiguous mega-buffer repack.
