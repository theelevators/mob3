# Publishing mob3 packages

Default branch is **`main`** (there is no `master`). Phase 13 (`@mob3/react` + publish metadata) is already on `main`.

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

## Local first publish (clone → npm)

Do this on a machine where you can `npm login` (not the cloud agent).

### 1. npm org + login (one-time)

1. Create the **`@mob3` npm org** (scope ≠ GitHub org — `entasis` / GitHub can stay as-is): https://www.npmjs.com/org/create
2. Log in:

```bash
npm login
npm whoami
```

### 2. Clone `main` and build

```bash
git clone https://github.com/theelevators/mob3.git
cd mob3
git checkout main
npm ci
npm run build
npm test
npm run typecheck
npm run publish:check
```

### 3. Dry-run (optional)

```bash
npm run publish:dry
```

Or per package:

```bash
npm publish -w mob3 --dry-run
npm publish -w @mob3/assets --dry-run
npm publish -w @mob3/input --dry-run
npm publish -w @mob3/three --dry-run
npm publish -w @mob3/rapier --dry-run
npm publish -w @mob3/react --dry-run
```

### 4. Publish for real

**Order matters** (workspace deps):

```bash
npm run publish:packages
```

Equivalent manual sequence:

```bash
npm publish -w mob3 --access public
npm publish -w @mob3/assets --access public
npm publish -w @mob3/input --access public
npm publish -w @mob3/three --access public
npm publish -w @mob3/rapier --access public
npm publish -w @mob3/react --access public
```

### 5. Tag the release

```bash
git tag v0.1.0
git push origin v0.1.0
```

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
