# wasm-integrate-rust (optional proof)

Hand-written WAT already proves mob3 ↔ WASM. This folder is a **minimal**
Rust sketch of the same integrate system — not an SDK.

## Contract

Same as `packages/core/tests/fixtures/wasm/integrate.wat`:

- Import `env.memory` (shared)
- Export `abi_version -> i32` (= 1)
- Export `run(count, delta, tx, ty, tz, vx, vy, vz)` with byte offsets

No wasm-bindgen. No mob3 crate. Numeric params + linear memory only.

## Build (local toolchain)

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
# copy target/wasm32-unknown-unknown/release/integrate.wasm
```

Point `wasmSystem({ module: ... })` at the produced `.wasm`.

## Non-goals

No procedural macros, derive bindings, or `@mob3/rust-sdk`.
