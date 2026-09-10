# Phase 13 Design — React Adapter + Publish Readiness

## Why

Phase 12 fixed browser packaging and Transform dirty DX. Remaining day-one tax from msh-up / BoxClub:

1. React lifecycle (Strict Mode remount, canvas size, dispose) is still on the app author
2. Packages are not published — adopters still vendor builds

## Goals

1. **`@mob3/react`** — `useMob3App` + `Mob3Canvas` with Strict Mode–safe dispose, optional ThreePlugin, post-mount resize
2. **Publish readiness** — `publishConfig`, repository metadata, `files`, browser-entry check script, publishing docs
3. **Example** — `examples/react-canvas` proving the adapter

## Non-goals

- Full React UI framework / JSX scene graph
- Actually running `npm publish` from CI in this slice (docs + dry-run check only unless credentials exist)
- Next.js App Router deep integration beyond a documented pattern

## API sketch

```ts
const { app, canvasRef } = useMob3App({
  three: { syncMode: "always" },
  plugins: [/* optional extra */],
  setup(app) { /* spawn once */ },
});

// or
<Mob3Canvas three={{ syncMode: "always" }} setup={...} />
```

## Exit criteria

- Strict Mode double-mount does not leak App / WebGL contexts
- Canvas 0×0 at mount recovers after layout via resize
- `npm run publish:check` validates browser entry has no `node:` imports
- Publishing docs list the package set and dry-run command
