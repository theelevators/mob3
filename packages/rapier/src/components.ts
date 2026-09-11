import { component, resource, event, tag, type Entity } from "@mob3/core";
import type RAPIER from "@dimforge/rapier3d-compat";

export type RigidBodyKind = "dynamic" | "kinematicPosition" | "fixed";

export type RigidBodyData = {
  kind: RigidBodyKind;
  /** Linear velocity (dynamic). */
  lx: number;
  ly: number;
  lz: number;
};

export const RigidBody = component<RigidBodyData>(
  {
    kind: "dynamic",
    lx: 0,
    ly: 0,
    lz: 0,
  },
  "RigidBody",
);

export type PhysicsColliderData = {
  shape: "ball" | "cuboid";
  /** ball */
  radius: number;
  /** cuboid half-extents */
  hx: number;
  hy: number;
  hz: number;
  sensor: boolean;
  /** Collision groups — default all */
  membership: number;
  filter: number;
};

export const PhysicsCollider = component<PhysicsColliderData>(
  {
    shape: "ball",
    radius: 0.5,
    hx: 0.5,
    hy: 0.5,
    hz: 0.5,
    sensor: false,
    membership: 0xffff,
    filter: 0xffff,
  },
  "PhysicsCollider",
);

/** Internal: body already created in Rapier. */
export const HasPhysicsBody = tag("HasPhysicsBody");

export const CollisionStarted = event<{
  a: Entity;
  b: Entity;
}>("CollisionStarted");

export type PhysicsWorldData = {
  world: RAPIER.World;
  /** entity → rigid body handle */
  bodies: Map<Entity, RAPIER.RigidBody>;
  /** collider handle → entity */
  colliderToEntity: Map<number, Entity>;
  eventQueue: RAPIER.EventQueue;
  gravity: { x: number; y: number; z: number };
  bodyCount(): number;
};

export const PhysicsWorld = resource<PhysicsWorldData>("PhysicsWorld");
