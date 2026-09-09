export {
  RigidBody,
  PhysicsCollider,
  HasPhysicsBody,
  PhysicsWorld,
  CollisionStarted,
  type RigidBodyKind,
  type RigidBodyData,
  type PhysicsColliderData,
  type PhysicsWorldData,
} from "./components.js";

export { initRapier, isRapierReady, RAPIER } from "./init.js";

export {
  RapierPlugin,
  ensurePhysicsBodies,
  writeKinematicTransforms,
  stepPhysics,
  readDynamicTransforms,
  emitCollisionEvents,
  cleanupPhysicsBodies,
  physicsBodyCount,
  type RapierPluginOptions,
} from "./plugin.js";
