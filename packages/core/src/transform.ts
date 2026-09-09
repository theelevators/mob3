import { component } from "./component.js";
import type { World } from "./world.js";
import type { Entity } from "./entity.js";

/**
 * Local spatial transform. Simulation-authoritative.
 * Rendering plugins (e.g. @mob3/three) may sync this onto view objects.
 *
 * Mutations via `world.get()` do **not** mark change detection.
 * Use `world.getMut`, `world.mutate`, or the helpers below.
 */
export type TransformData = {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
};

export const Transform = component<TransformData>(
  {
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
  },
  "Transform",
);

function requireTransform(world: World, entity: Entity): TransformData {
  const t = world.getMut(entity, Transform);
  if (!t) {
    throw new Error(
      `Transform missing on entity ${entity}. Spawn with Transform() or add it first.`,
    );
  }
  return t;
}

/** Set translation and mark Transform (+ hierarchy) dirty. */
export function setTranslation(
  world: World,
  entity: Entity,
  x: number,
  y: number,
  z: number,
): void {
  const t = requireTransform(world, entity);
  t.x = x;
  t.y = y;
  t.z = z;
}

/** Set Euler rotation (radians) and mark dirty. */
export function setRotation(
  world: World,
  entity: Entity,
  rx: number,
  ry: number,
  rz: number,
): void {
  const t = requireTransform(world, entity);
  t.rx = rx;
  t.ry = ry;
  t.rz = rz;
}

/** Set scale and mark dirty. */
export function setScale(
  world: World,
  entity: Entity,
  sx: number,
  sy: number = sx,
  sz: number = sx,
): void {
  const t = requireTransform(world, entity);
  t.sx = sx;
  t.sy = sy;
  t.sz = sz;
}

/** Patch Transform fields and mark dirty. */
export function patchTransform(
  world: World,
  entity: Entity,
  patch: Partial<TransformData>,
): void {
  const t = requireTransform(world, entity);
  Object.assign(t, patch);
}
