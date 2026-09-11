import {
  Transform,
  Parent,
  FixedUpdate,
  PendingDespawn,
  system,
  type App,
  type Plugin,
  type World,
  type Entity,
} from "@mob3/core";
import { RAPIER, isRapierReady } from "./init.js";
import {
  RigidBody,
  PhysicsCollider,
  HasPhysicsBody,
  PhysicsWorld,
  CollisionStarted,
  type PhysicsWorldData,
} from "./components.js";

export type RapierPluginOptions = {
  gravity?: { x: number; y: number; z: number };
};

/**
 * Rapier integration. Requires `await initRapier()` first.
 *
 * Transform authority:
 * - kinematicPosition: Gameplay → Transform → Rapier (write)
 * - dynamic: Rapier → Transform (read after step)
 * - fixed: set once at creation
 *
 * Phase 9: dynamic rigid bodies must be hierarchy roots (no Parent).
 */
export function RapierPlugin(options: RapierPluginOptions = {}): Plugin {
  const gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };

  return {
    build(app: App) {
      if (!isRapierReady()) {
        throw new Error(
          "RapierPlugin: call await initRapier() before app.addPlugin(RapierPlugin(...))",
        );
      }

      const world = new RAPIER.World(gravity);
      const eventQueue = new RAPIER.EventQueue(true);
      const physics: PhysicsWorldData = {
        world,
        bodies: new Map(),
        colliderToEntity: new Map(),
        eventQueue,
        gravity,
        bodyCount() {
          return this.bodies.size;
        },
      };
      app.insertResource(PhysicsWorld, physics);

      app.addSystem(FixedUpdate, ensurePhysicsBodies);
      app.addSystem(FixedUpdate, enforceDynamicBodyRoots, {
        after: ensurePhysicsBodies,
      });
      app.addSystem(FixedUpdate, writeKinematicTransforms, {
        after: enforceDynamicBodyRoots,
      });
      app.addSystem(FixedUpdate, stepPhysics, {
        after: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, readDynamicTransforms, {
        after: stepPhysics,
      });
      app.addSystem(FixedUpdate, emitCollisionEvents, {
        after: stepPhysics,
      });
      app.addSystem(FixedUpdate, cleanupPhysicsBodies, {
        after: emitCollisionEvents,
      });
    },
    dispose(app: App) {
      const pw = app.world.tryResource(PhysicsWorld);
      if (pw) {
        pw.bodies.clear();
        pw.colliderToEntity.clear();
        pw.world.free();
        app.world.removeResource(PhysicsWorld);
      }
    },
  };
}

/** Phase 9: dynamic bodies cannot participate in ECS hierarchy. */
export const enforceDynamicBodyRoots = system({
  name: "enforceDynamicBodyRoots",
  access: {
    read: [RigidBody, Parent],
  },
  run(world) {
    for (const [entity, rb] of world.query(RigidBody, Parent)) {
      if (rb.kind === "dynamic") {
        throw new Error(
          `Dynamic rigid body entity ${entity} cannot be parented (Phase 9 restriction). Keep dynamics as roots, or use kinematic bodies.`,
        );
      }
    }
  },
});

export const ensurePhysicsBodies = system({
  name: "ensurePhysicsBodies",
  access: {
    read: [Transform, RigidBody, PhysicsCollider, HasPhysicsBody, Parent],
    resources: { write: [PhysicsWorld] },
    commands: true,
  },
  run(world, commands) {
    const pw = requirePhysics(world);
    for (const [entity, transform, rb, col] of world.query(
      Transform,
      RigidBody,
      PhysicsCollider,
    )) {
      if (world.has(entity, HasPhysicsBody)) continue;

      if (rb.kind === "dynamic" && world.has(entity, Parent)) {
        throw new Error(
          `Dynamic rigid body entity ${entity} cannot be parented (Phase 9 restriction).`,
        );
      }

      const desc =
        rb.kind === "fixed"
          ? RAPIER.RigidBodyDesc.fixed()
          : rb.kind === "kinematicPosition"
            ? RAPIER.RigidBodyDesc.kinematicPositionBased()
            : RAPIER.RigidBodyDesc.dynamic();

      desc.setTranslation(transform.x, transform.y, transform.z);
      desc.setLinvel(rb.lx, rb.ly, rb.lz);
      const body = pw.world.createRigidBody(desc);

      const colliderDesc =
        col.shape === "cuboid"
          ? RAPIER.ColliderDesc.cuboid(col.hx, col.hy, col.hz)
          : RAPIER.ColliderDesc.ball(col.radius);

      colliderDesc.setSensor(col.sensor);
      colliderDesc.setCollisionGroups(
        ((col.membership & 0xffff) << 16) | (col.filter & 0xffff),
      );
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      // Arena uses kinematic bodies; enable kinematic–kinematic contacts.
      colliderDesc.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
          RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC |
          RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED |
          RAPIER.ActiveCollisionTypes.DYNAMIC_KINEMATIC,
      );

      const collider = pw.world.createCollider(colliderDesc, body);
      pw.bodies.set(entity, body);
      pw.colliderToEntity.set(collider.handle, entity);
      commands.add(entity, HasPhysicsBody);
    }
  },
});

export const writeKinematicTransforms = system({
  name: "writeKinematicTransforms",
  access: {
    read: [Transform, RigidBody],
    resources: { write: [PhysicsWorld] },
  },
  run(world) {
    const pw = requirePhysics(world);
    for (const [entity, transform, rb] of world.query(Transform, RigidBody)) {
      if (rb.kind !== "kinematicPosition") continue;
      const body = pw.bodies.get(entity);
      if (!body) continue;
      body.setNextKinematicTranslation({
        x: transform.x,
        y: transform.y,
        z: transform.z,
      });
    }
  },
});

export const stepPhysics = system({
  name: "stepPhysics",
  access: {
    resources: { write: [PhysicsWorld] },
  },
  run(world) {
    const pw = requirePhysics(world);
    pw.world.step(pw.eventQueue);
  },
});

export const readDynamicTransforms = system({
  name: "readDynamicTransforms",
  access: {
    write: [Transform, RigidBody],
    resources: { read: [PhysicsWorld] },
  },
  run(world) {
    const pw = requirePhysics(world);
    for (const [entity, , rb] of world.query(Transform, RigidBody)) {
      if (rb.kind !== "dynamic") continue;
      const body = pw.bodies.get(entity);
      if (!body) continue;
      const transform = world.getMut(entity, Transform)!;
      const t = body.translation();
      transform.x = t.x;
      transform.y = t.y;
      transform.z = t.z;
      const v = body.linvel();
      rb.lx = v.x;
      rb.ly = v.y;
      rb.lz = v.z;
    }
  },
});

export const emitCollisionEvents = system({
  name: "emitCollisionEvents",
  access: {
    resources: { write: [PhysicsWorld] },
    events: { write: [CollisionStarted] },
  },
  run(world) {
    const pw = requirePhysics(world);
    pw.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = pw.colliderToEntity.get(h1);
      const b = pw.colliderToEntity.get(h2);
      if (a === undefined || b === undefined) return;
      if (!world.isAlive(a) || !world.isAlive(b)) return;
      world.send(CollisionStarted, { a, b });
    });
  },
});

export const cleanupPhysicsBodies = system({
  name: "cleanupPhysicsBodies",
  access: {
    read: [HasPhysicsBody, PendingDespawn],
    resources: { write: [PhysicsWorld] },
  },
  run(world) {
    const pw = requirePhysics(world);
    for (const [entity] of world.query(HasPhysicsBody).with(PendingDespawn)) {
      removeBody(pw, entity);
    }
  },
});

function requirePhysics(world: World): PhysicsWorldData {
  const pw = world.tryResource(PhysicsWorld);
  if (!pw) {
    throw new Error("PhysicsWorld resource missing — add RapierPlugin");
  }
  return pw;
}

function removeBody(pw: PhysicsWorldData, entity: Entity): void {
  const body = pw.bodies.get(entity);
  if (!body) return;
  const n = body.numColliders();
  for (let i = 0; i < n; i++) {
    const c = body.collider(i);
    if (c) pw.colliderToEntity.delete(c.handle);
  }
  pw.world.removeRigidBody(body);
  pw.bodies.delete(entity);
}

export function physicsBodyCount(world: World): number {
  return world.resource(PhysicsWorld).bodyCount();
}
