# Phase 8 Findings — WASM Executor

## Verdict

**Yes — WASM can consume Execution ABI v1** and mutate the same packed
component memory as JS with **no per-tick component extract/copy/commit** on the
shared path.

WASM is another executor behind the existing plan → ABI → storage stack.
Deleting the WASM executor would leave core, ExecutionPlan, ABI, and apps
coherent. Another backend could consume the same ABI without scheduler changes.

## ABI changes

**ABI v1 survived unchanged.**

No executor-neutral defects required mutating the contract. Transport binding
(`WasmAbiExecutor` + `WasmMemoryArena`) maps field buffers/offsets onto
`WebAssembly.Memory` without extending `SystemInvocation`.

## Memory

Optional opt-in backing:

- Default shared: standalone `SharedArrayBuffer` (Phase 6) — unchanged
- `backing: "wasm"`: slice of a host `WasmMemoryArena` (`WebAssembly.Memory`
  shared) allocated at fixed capacity

Not every shared component becomes WASM memory.

Spike proof: JS `Float32Array` over `memory.buffer` and a tiny WAT module
mutate the same region (`[1,2,3,4]` → `[2,4,6,8]`) with zero copies.

## Zero copy

Shared WASM path: commit ≈ 0. Fields already live in arena linear memory.
Invocation passes byte offsets + count + delta only.

## Correctness

- 100k entities × 5 ticks: WASM ≡ InProcess JS ABI within **1e-5** when JS
  uses `Math.fround` (storage-rounded f32 semantics)
- 10k ticks × 40 entities: same equivalence

## Numeric semantics

JS numbers are f64; packed columns are f32; WASM uses f32 ops.
Naive JS `a += b * dt` can diverge from WASM. Documented approach: f32 systems
compare against a `Math.fround`-aware JS reference. Do not claim bit-identical
JS↔WASM without that discipline.

## Performance (this environment, cheap integrate)

| Ents | object ms | ABI InProcess ms | WASM warm ms | WASM vs InProcess |
| ---: | ---: | ---: | ---: | ---: |
| 1k | 0.45 | 0.12 | **0.024** | **4.8×** |
| 10k | 2.2 | 0.10 | **0.069** | **1.5×** |
| 50k | 14.7 | 0.48 | **0.30** | **1.6×** |
| 100k | 32.5 | 0.92 | **0.49** | **1.9×** |
| 250k | 94.2 | 2.12 | **1.26** | **1.7×** |

Cold compile/instantiate: ~1–12 ms once (not in warm tick).

**Crossover:** for this dense SoA integrate, WASM beats InProcess JS even at 1k
here. Object query remains far slower. Results are workload-specific — do not
generalize to all systems.

## Worker + WASM

Mixed plan batches work: WASM runs on the **host thread** inside
`ParallelExecutor` `Promise.all` alongside JS workers / main systems.

`WebAssembly.Memory` is not reconstructible from an arbitrary SAB in another
worker. Worker placement for `wasmSystem` sets planner affinity only; zero-copy
WASM stays on the arena owner thread. JS workers can still see the same SAB
columns via ABI/shared paths.

## Failure semantics

WASM traps fail the system loudly (system name + error). **No rollback** of
shared writes already performed in the failing batch — documented; copying
stores for transactions would destroy the zero-copy goal.

## Ergonomics

Authoring: WAT (~30 lines) or any language emitting:

- imported shared memory
- `abi_version() → i32`
- `run(count, delta, offsets…)`

`wasmSystem({ module, access, expects })` + `App({ wasmArena: true })` +
`backing: "wasm"` components. Normal apps never need WASM.

Descriptor-table `run(invocationOffset)` investigated conceptually; direct
offset args were enough for the first fixture — table deferred (not required
for proof).

## Trust

Sharing linear memory means the module is **trusted application code**.
Capability narrowing withholds undeclared store bindings; it is not a hostile
sandbox.

## Future binding/codegen

Would help: generate expects + offset bind tables from packed schemas for
Rust/C. Not required for ABI validity. No SDK/macros in this phase.

## Non-goals kept

No WASM World/Commands, no Rust SDK, no WASI, no grow-during-execution, no fake
shared rollback.

## Artifacts

- `docs/phase-8-design.md`
- Fixtures: `packages/core/tests/fixtures/wasm/*.wat|.wasm`
- Bench: `npm run bench:wasm`
- APIs: `WasmMemoryArena`, `wasmSystem`, `WasmAbiExecutor`
