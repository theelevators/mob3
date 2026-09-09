# Phase 3 Design — Ecosystem Boundary

## Question

> Can independent capabilities compose around a mob3 application without the core becoming coupled to any of them?

## 1. Current plugin API

```ts
interface Plugin {
  build(app: App): void;
}
app.addPlugin(plugin);
```

Systems: `(world, commands) => void`, registration order within a schedule label. Commands flush after each system. No dispose. No before/after.

## 2. Lifecycle gaps

| Gap | Needed by |
| --- | --- |
| `dispose` | DOM listeners, rAF, Three renderer, Rapier world |
| Ownership of supplied vs created objects | ThreePlugin / RapierPlugin |
| Despawn observation | Physics body + mesh cleanup (PendingDespawn remains public contract) |
| Ordering inside FixedUpdate | gameplay → kinematic write → physics step → dynamic read → collisions |

## 3. Proposed plugin lifecycle

```ts
interface Plugin {
  build(app: App): void;
  dispose?(app: App): void;
}

app.dispose(); // stop runner, run plugin.dispose once, run onDispose hooks
```

Also: `app.onDispose(fn)` for one-off cleanups registered during `build`.

**Ownership rule:** created by plugin → plugin disposes; supplied by caller → caller owns (plugin does not dispose).

## 4. Input ownership

`@mob3/input` owns:

- `Input` resource (pressed / justPressed / justReleased)
- DOM adapter plugin (`InputPlugin`)
- Synthetic driver (`applyInput` / `SyntheticInputPlugin`) for headless

**Transient semantics:** `justPressed` / `justReleased` are **frame-scoped**. They are set when edges occur (DOM or synthetic), remain visible for all FixedUpdate steps in that `App.update`, and clear at end of `App.update`. Determinism tests use `dt = fixedDelta` (one fixed step/frame), so multi-step edge replay is a documented caveat; gameplay may also gate on cooldowns.

Gameplay never imports DOM.

## 5. Physics ownership

`@mob3/rapier` owns:

- `PhysicsWorld` resource (wraps Rapier world)
- Components: `RigidBody`, `PhysicsCollider` (intent)
- Systems: create bodies, kinematic write, step, dynamic read, collision events, PendingDespawn cleanup
- `CollisionStarted` event with `Entity` pairs

Gameplay uses ECS events/components, not Rapier handles.

## 6. Transform authority

| Entity kind | Authority chain |
| --- | --- |
| No physics | Gameplay → `Transform` → Renderer |
| Dynamic body | Rapier step → `Transform` → Renderer |
| Kinematic body | Gameplay → `Transform` → Rapier (write) → (no dynamic overwrite) → Renderer |

No bidirectional sync. Dynamic entities: gameplay moves via forces/impulses or by not fighting Rapier; arena player/enemies use kinematic or dynamic as chosen below.

**Arena choice:** Player + enemies = **kinematic** (gameplay sets Transform; Rapier for collisions). Projectiles = **dynamic** or kinematic with sweep — use **kinematic** for all for determinism simplicity, collision via Rapier contact events. Alternatively all kinematic with Rapier intersection queries.

Simplest pressure test: kinematic bodies for player/enemy/projectile; Rapier detects intersections; Transform always from gameplay/movement systems; Rapier never writes Transform for kinematics.

Dynamic optional path still implemented and tested for authority rules.

## 7. Scheduler

Add minimal **before/after by system function identity** within a schedule label. Topological order at run time (stable among unordered).

Physics plugin registers:

1. `syncBodies` (create missing)
2. `writeKinematics` — after gameplay movement (gameplay systems registered first by app, or physics uses `.after` if needed)
3. `stepPhysics`
4. `readDynamics`
5. `emitCollisions`
6. `cleanupPending` (bodies)

Arena registers movement before physics step via registration order + documented `.before(stepPhysics)`.

## 8. Disposal semantics

- `dispose()` idempotent: second call no-ops (or throws once-disposed — prefer **idempotent no-op**).
- `run()` after dispose → clear error.
- Restart (`run` after `stop` without dispose) **supported** for browser runner.

## 9. Headless composition

```ts
new App()
  .addPlugin(SyntheticInputPlugin())
  .addPlugin(RapierPlugin({ gravity: { x:0,y:0,z:0 } }))
  .addPlugin(MobArenaPlugin({ seed }));
```

No `@mob3/three`. Rapier via `@dimforge/rapier3d-compat` (works in Node).

## 10. Debug canvas

`DebugCanvasPlugin` in `examples/debug-canvas` (or `@mob3/debug-canvas` example-local) reads `Transform` + tags, draws 2D. Not a published abstraction hierarchy — just another plugin.

## 11. Non-goals

No IRenderer/IPhysicsEngine. Interop = ECS resources, components, systems, events.
