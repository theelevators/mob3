# mob3

**mob3 brings ECS application architecture to three.js without trying to replace three.js.**

Three.js remains the renderer. mob3 owns application structure: entities, components, queries, resources, systems, schedules, events, and plugins.

```
Application
    │
    ▼
┌─────────────────────────────┐
│            mob3             │
│  Entities  Components       │
│  Queries   Resources        │
│  Systems   Events           │
│  Scheduler Plugins          │
└──────────────┬──────────────┘
               │
        integration plugins
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
  Three.js   Rapier    Web APIs
```

## Packages

| Package | Role |
| --- | --- |
| `mob3` | Core ECS + App runtime (no Three dependency) |
| `@mob3/three` | Thin Three.js integration plugin |

## Quick start

```ts
import { App, Update, Startup, Time, component, type World } from "mob3";
import { ThreePlugin, Transform, ThreeObject, ThreeScene } from "@mob3/three";
import * as THREE from "three";

const RotationSpeed = component({ y: 1 });

function setup(world: World) {
  const scene = world.resource(ThreeScene);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x44aa88 }),
  );
  scene.add(mesh);
  world.spawn(Transform(), RotationSpeed({ y: 1.2 }), ThreeObject(mesh));
}

function rotate(world: World) {
  const { delta } = world.resource(Time);
  for (const [, transform, speed] of world.query(Transform, RotationSpeed)) {
    transform.ry += speed.y * delta;
  }
}

new App()
  .addPlugin(ThreePlugin({ canvas }))
  .addSystem(Startup, setup)
  .addSystem(Update, rotate)
  .run();
```

Headless / tests:

```ts
const app = new App().addSystem(Update, movement);
app.update(1 / 60);
```

## Principles

1. **Three.js stays Three.js** — use `Scene`, `Mesh`, `Material`, `Object3D` directly.
2. **ECS state is authoritative** — a mesh is a component, not the object model.
3. **Composition over inheritance** — behavior lives in systems.
4. **Bevy-inspired, TypeScript-native** — borrow ideas, not Rust APIs.
5. **Small core** — `mob3` must not depend on Three.js.

## Schedules

`Startup` → `PreUpdate` → `FixedUpdate` (0..N) → `Update` → `PostUpdate` → `PreRender` → `Render` → `PostRender`

Transform sync runs in `PreRender` (**ECS → Three**). Render runs in `Render`.

## Workspace

```bash
npm install
npm test
npm run build
npm run example:cubes
npm run bench
```

## Docs

- [Design](./docs/design.md)
- [API experiments](./docs/api-experiments.md)
- [Phase 2 findings](./docs/phase-2-findings.md)
- [Phase 3 design](./docs/phase-3-design.md)
- [Phase 3 findings](./docs/phase-3-findings.md)

## Status

Phase 1–3 complete:

- Packages: `mob3`, `@mob3/input`, `@mob3/three`, `@mob3/rapier`
- Mob Arena composes plugins; Canvas and headless prove renderers are optional

```bash
npm run example:arena           # Three
npm run example:canvas          # Canvas 2D
npm run example:arena:headless  # no renderer
```
