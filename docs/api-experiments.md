# API Experiments

Prototypes considered before locking v0.1 APIs. Prefer TypeScript-native feel over Bevy-translated Rust.

## Experiment A — Class components

```ts
class Position {
  constructor(public x = 0, public y = 0, public z = 0) {}
}

world.spawn(new Position(1, 2, 3), new Velocity(1, 0, 0));
world.query(Position, Velocity); // types via constructor
```

**Pros:** Familiar OO; constructors as type keys.  
**Cons:** Verbosity; inheritance temptation; harder tag story; `new` noise in spawn lists.

## Experiment B — Factory / schema (chosen)

```ts
const Position = component({ x: 0, y: 0, z: 0 });
const Velocity = component({ x: 0, y: 0, z: 0 });
const Player = tag();

world.spawn(
  Position({ x: 0, y: 1, z: 0 }),
  Velocity({ x: 1 }),
  Player,
);
```

**Pros:** Ergonomic; strong inference; tags are natural; identity is stable function object; data is plain.  
**Cons:** Need spawn/add to distinguish tag types vs instances (branded instances).

### Inference sketch

```ts
type InferComponent<C> = C extends ComponentType<infer T> ? T : never;

type QueryItems<Cs extends ComponentType[]> = {
  [I in keyof Cs]: InferComponent<Cs[I]>;
};

// Iterable yields [Entity, ...QueryItems<Cs>]
```

## Experiment C — Entity-as-object (miniplex-like)

```ts
world.add({ position: { x: 0 }, velocity: { x: 1 }, player: true });
```

**Rejected for core:** Makes `Object3D`-like bags the model; weakens opaque Entity IDs and future SoA/archetype storage.

## Experiment D — System DI

```ts
function movement(query: Query<[Position, Velocity]>, time: Res<Time>) {}
```

**Deferred:** Explicit `world` parameter is clearer until patterns stabilize.

```ts
function movement(world: World) {
  const time = world.resource(Time);
  for (const [, p, v] of world.query(Position, Velocity)) {
    p.x += v.x * time.delta;
  }
}
```

## Experiment E — Resource keys

| Shape | Example | Notes |
| --- | --- | --- |
| Class | `world.resource(Time)` | Nice with `instanceof` |
| Token | `const Time = resource<TimeData>()` | Matches component style |

**v0.1:** Support constructor functions **or** `resource()` tokens as keys (both are object identity).

## Experiment F — Events lifetime

1. **Clear at end of frame** — same-frame producer→consumer works; simplest.  
2. **Double buffer** — read previous, write current; Bevy-like.  
3. **Manual flush** — easy to leak.

**Chosen for v0.1:** Clear at end of each `App.update()` after all schedules run. Document: events are readable only during the update they were sent in (and by later systems that frame).

## Representative target usage (locked)

```ts
import { App, Update, Startup, component, tag } from "mob3";
import { ThreePlugin, Transform, ThreeObject } from "@mob3/three";
import * as THREE from "three";

const RotationSpeed = component({ y: 1 });

function setup(world: World) {
  const scene = world.resource(ThreeScene);
  for (let i = 0; i < 1000; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x44aa88 }),
    );
    scene.add(mesh);
    world.spawn(
      Transform({ x: (i % 40) - 20, y: 0, z: Math.floor(i / 40) - 12 }),
      RotationSpeed({ y: 0.5 + (i % 10) * 0.05 }),
      ThreeObject(mesh),
    );
  }
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

## Storage note

Public API must not expose `Map` stores so Phase 6 can swap implementations without breaking call sites.
