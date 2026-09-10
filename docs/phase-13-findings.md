# Phase 13 Findings — React Adapter + Publish Readiness

## Shipped

- **`@mob3/react`**: `createMob3App` / `destroyMob3App`, `useMob3App`, `Mob3Canvas`
- Strict Mode–safe dispose (cleanup cleared after first destroy)
- Optional ThreePlugin wiring with `syncMode: "always"` default in the helper
- Post-mount resize dispatch for 0×0 canvas recovery
- Publish metadata (`publishConfig`, repository) on all packages
- `npm run publish:check` guards browser entry against `node:` imports
- `examples/react-canvas` + updated React cookbook
- Docs: `docs/phase-13-design.md`, `docs/publishing.md`

## Still open

- Actually publishing to npm (needs org/credentials)
- Next.js App Router recipe beyond the cookbook
- Deeper tree-shaking CI budget beyond entry splits

## Validation

- 135 tests green (4 new lifecycle tests)
- `publish:check` passes on `packages/core/dist/browser.js`
