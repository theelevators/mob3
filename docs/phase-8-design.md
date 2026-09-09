# Phase 8 Design — WASM Executor

## Question

> Can a WebAssembly module consume Execution ABI v1 and operate directly over
> mob3 packed/shared component memory without per-tick world copies?

Success: **WASM is another executor**, not a second ECS.

## 1. ABI memory today (Phase 7)

- `StoreInvocation` / `FieldMemoryDescriptor`: buffer + byteOffset + length
- Shared path: `SharedArrayBuffer` columns (SoA), dense `[0, count)`
- Local/copy: cloned `ArrayBuffer`s, commit writes back
- Capability narrowing: only declared stores appear
- No World in `execute`

## 2. What maps directly to WASM

| ABI concept | WASM mapping |
| --- | --- |
| count, delta, tick | i32 / f32 params or invocation table |
| storeId / fieldId | i32 (diagnostics stay on host) |
| scalar types f32/i32/… | native WASM loads/stores |
| dense SoA rows | indexed loads at `base + i * stride` |

## 3. Transport-specific binding

- ABI stays buffer/offset descriptors (executor-neutral)
- `WasmBinding` translates declared fields → offsets into **one** `WebAssembly.Memory`
- JS names, World, App never enter the module

## 4. WebAssembly.Memory ownership

Arbitrary existing SAB ≠ WASM linear memory.

Investigate optional backing:

```
WebAssembly.Memory (shared)
        │
  SharedArrayBuffer (== memory.buffer)
        │
 SharedPackedStorage columns (external buffer + offsets)
```

Existing SAB-backed SharedPackedStorage remains valid.
Not all shared storage becomes WASM memory.

Small internal concept:

```
SharedMemoryRegion { buffer, byteLength }
WasmMemoryArena    { memory: WebAssembly.Memory, alloc(...) }
```

## 5. Shared-memory requirements

- Prefer `WebAssembly.Memory({ shared: true, … })` where available
- Fixed capacity / fixed max pages — **no grow during execution** in Phase 8
- Structural mutation host-side only; layout generation invalidates bindings

## 6. Field layout

Host-controlled SoA inside the arena (same alignment rules as Phase 6).
WASM receives byte offsets — does not invent layout.

Optional multi-store arena in one linear memory (WASM-friendly).
Normal mob3 does not require a mega-layout for non-WASM paths.

## 7. Invocation arguments

First fixture (correctness):

```
run(count, delta, tx, ty, tz, vx, vy, vz)  // byte offsets
```

Then experiment with a tiny in-memory **invocation table**
(`run(invocationOffset)`) — keep if clearly useful; else document & defer.

## 8–10. Lifecycles & errors

Module: load → compile → instantiate → bind schema → execute many → dispose  
Executor: cache Module/instance/binding; dispose releases refs  

Traps / bad export / ABI mismatch: fail loudly with system + module context.
Shared writes before a trap are **not** rolled back (document; no fake copy-rollback).

## 11. Performance expectations

- Shared WASM path: commit ≈ 0; no 100k extract/copy
- Cold: compile/instantiate/bind separate from warm ticks
- Honest matrix vs JS main / InProcess / worker — no forced WASM win

## 12. Fallback

- `wasm: "preferred" | "required"`
- Preferred: fall back to JS ABI module if provided
- Required: clear error if WASM/shared memory unavailable
- Copy-into-WASM optional for local PackedStorage — labeled slow

## Non-goals

WASM World/Commands/SDK, WASI, codegen framework, atomic structural mutation,
SIMD/threads unless isolated bench, Mob Arena gameplay port.

## Trust

WASM sharing linear memory is **trusted application code**.
Capability narrowing ≠ sandbox security.
