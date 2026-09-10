# Publishing mob3 packages

## Packages

| Package | npm name |
|---------|----------|
| core | `mob3` |
| three | `@mob3/three` |
| assets | `@mob3/assets` |
| input | `@mob3/input` |
| rapier | `@mob3/rapier` |
| react | `@mob3/react` |

Default `mob3` entry is **browser-safe**. Node workers / WASM loaders:

- `mob3/parallel`
- `mob3/abi`
- `mob3/node`

Three splits:

- `@mob3/three` / `@mob3/three/plugin`
- `@mob3/three/gltf`
- `@mob3/three/animation`

## Pre-publish checklist

```bash
npm run build
npm test
npm run typecheck
npm run publish:check
```

`publish:check` asserts the browser entry for `mob3` does not contain `node:` imports.

Dry-run (no upload):

```bash
npm publish -w mob3 --dry-run
npm publish -w @mob3/three --dry-run
npm publish -w @mob3/assets --dry-run
npm publish -w @mob3/input --dry-run
npm publish -w @mob3/rapier --dry-run
npm publish -w @mob3/react --dry-run
```

## First publish

1. Ensure npm org `@mob3` exists (or change scoped names)
2. `npm login`
3. Publish **in dependency order**: `mob3` → `@mob3/assets` → `@mob3/input` → `@mob3/three` → `@mob3/rapier` → `@mob3/react`
4. Tag `v0.1.0`

## Consumer install

```bash
npm install mob3 @mob3/three three
# optional
npm install @mob3/react react react-dom
```

```ts
import { App } from "mob3";
import { ThreePlugin } from "@mob3/three/plugin";
import { useMob3App, Mob3Canvas } from "@mob3/react";
```
