# Phase 7 Findings — Execution ABI

## Verdict

mob3 can describe a system invocation as a small **Execution ABI v1** —
descriptors over packed/shared memory — without World, closures, or executor
coupling. The same ABI module produces equivalent state under:

- sequential `abiSystem` (in-process, no World in `execute`)
- `InProcessAbiExecutor`
- JS worker `dataPath: "copy"` (local memory descriptors)
- JS worker `dataPath: "shared"` (SAB field descriptors)

No WASM in this phase. The ABI does not know WASM is coming.

## Contract

| Piece | v1 |
| --- | --- |
| Version | `ABI_VERSION = 1` on every invocation |
| IDs | integers via `AbiIdRegistry` (App/executor lifetime only) |
| Memory | SoA field buffers + dense `entities[0..count)` |
| Access | capability-narrowed stores; `ctx.read` / `ctx.write` |
| Commands | out of scope |
| Resources | scalar / clone-safe snapshots only |
| Events | optional result batches |

Primary APIs: `defineAbiSystem`, `abiSystem`, `buildSystemInvocation`,
`InProcessAbiExecutor`, ParallelExecutor ABI path (`abi-shared` / `abi-copy`).

Legacy `workerSystem` Phase 5/6 payloads remain for compatibility.

## Proofs

- Capability narrowing: undeclared stores absent; illegal `write` throws
- Schema mismatch / type mismatch rejected at bind or validate
- ABI context has no `world` / `app` / `commands`
- 100k entities: InProcess ≡ Worker shared (field-wise)
- 10k ticks: sequential ≡ shared worker
- Copy + shared ABI paths agree with sequential reference

## Performance (this environment)

Phase 6 shared (3 independent systems) vs Phase 7 ABI shared (single force /
integrate). Transfer is the cliff metric:

| Ents | P6 shared xfer | ABI shared xfer (force) | ABI integrate xfer |
| ---: | ---: | ---: | ---: |
| 10k | 0.57 ms | **0.09 ms** | 0.03 ms |
| 50k | 3.56 ms | **0.14 ms** | 0.11 ms |
| 100k | 6.95 ms | **0.26 ms** | 0.20 ms |
| 250k | 17.8 ms | **0.54 ms** | 0.51 ms |

ABI shared **commit ≈ 0**. Transfer stays sub-millisecond through 100k–250k —
the Phase 5 copy cliff is **not** reintroduced. Descriptor construction is
cheap relative to Phase 6 shared extract of multiple store headers.

(Absolute frame times are not apples-to-apples vs the 3-system Phase 6 matrix;
compare transfer/commit and path=`abi-shared`.)

## Generated bindings

Runtime `AbiContext` + column views are enough for JS. Codegen would mainly
help future WASM/static typing of field layouts — not required to prove the
contract. Deferred.

## Non-goals kept

No World serialization blob, no Commands ABI, no UUID identities, no contiguous
mega-buffer repack, no WASM executor.

## Next

A WASM executor can consume the same `SystemInvocation` shape. Until then,
keep pressure on ABI size and copy/shared parity.
