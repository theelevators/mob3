# mob3 Design

**One sentence:** mob3 brings ECS application architecture to three.js without trying to replace three.js.

## Goals

- Three.js remains the renderer; mob3 owns application structure.
- ECS state is authoritative; `Object3D` is a component, not the object model.
- Composition over inheritance; behavior lives in systems.
- Bevy-inspired concepts, TypeScript-native APIs.
- Small core (`mob3`) with no Three.js dependency; `@mob3/three` is integration only.

## Non-goals (v0.1)

Editor, asset pipeline, custom renderer/shaders, physics, networking, animation, prefabs, serialization, distributed ECS, workers, WASM, scripting. Do not become “Bevy in TypeScript.”

## Research summary

### Existing JS/TS ECS

| Library | Storage | Strength | Weakness for mob3 |
| --- | --- | --- | --- |
| **bitECS** | SoA typed arrays | Throughput at 10k+ | Opaque data, weak object ergonomics with Three |
| **miniplex** | Entity-as-object + archetypes | Excellent DX/TS | Entities are objects; fights “opaque Entity ID” |
| **flare / bitmask Maps** | Per-component `Map` + 32-bit masks | Clear debugger story | Hard 32-component ceiling |
| **apecs / ecsia** | Archetype SoA | Fast iteration | Heavier; premature for API spike |

**Decision:** Start with `Map<ComponentType, Map<Entity, data>>` (sparse stores). Hide storage behind `World`. Revisit sparse sets / archetypes / SoA only after benchmarks (Phase 6).

### Bevy concepts we borrow

- Entities, components, queries, resources, systems, schedules, events, plugins.
- Frame order: Startup once → PreUpdate → FixedUpdate (0..N) → Update → PostUpdate → PreRender → Render → PostRender.
- Plugins as `build(app)` configuration.
- Events as typed, short-lived messages (one update boundary).

### Bevy concepts we deliberately skip (v0.1)

- Rust-style system param DI / `Query<&mut T>` magic.
- Parallel schedulers, change detection, command buffers.
- Full hierarchy (`Parent`/`Children`/`GlobalTransform`).
- Extract/render world split.

### Three.js pain points mob3 addresses

1. Application state scattered across scene-graph nodes and ad-hoc globals.
2. Inheritance hierarchies (`class Player extends Mesh`) coupling logic to renderables.
3. No standard place for fixed-timestep gameplay vs render cadence.
4. Plugins/engines that wrap away `THREE.Scene` / `Mesh` / materials.

**Principle:** coordinate Three objects; never replace them.

## Component API choice

Investigated class-based vs factory/schema (see `api-experiments.md`).

**Chosen:** factory/schema + tags.

```ts
const Position = component({ x: 0, y: 0, z: 0 });
const Player = tag();

world.spawn(Position({ x: 1 }), Velocity({ x: 1 }), Player);
```

Rationale: excellent inference, predictable type identity, instance data is plain objects (Three-friendly), no class ceremony. Storage identity is the component function object itself.

## Entity model

```ts
type Entity = number;
```

World owns storage. Stale-handle generations deferred; IDs are recycled via a free list in v0.1 without generation bits (documented limitation).

## Query model

```ts
for (const [entity, position, velocity] of world.query(Position, Velocity)) { ... }

world.query(Position, Velocity).with(Player).without(Disabled);
```

- Queries are iterable views over live storage (no per-frame array allocation by default).
- `.collect()` available when a snapshot is needed.
- Change detection (`added`/`changed`/`removed`) is post-MVP.

## Authority direction (Three)

**ECS → Three** by default via `Transform` + `ThreeObject` sync in PreRender.

External Three mutations are not auto-imported; explicit APIs can be added later.

## Package layout

```
mob3/                 → packages/core (published as "@mob3/core")
@mob3/three           → packages/three
```

Future: `@mob3/rapier`, `@mob3/input`, `@mob3/debug`.

## Architectural test

> Is this application structure, or are we accidentally building a game engine?

Structure → mob3. Rendering/physics/audio/assets/networking → integration packages, not core.
