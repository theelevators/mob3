import type { World } from "./world.js";
import { Parent, Children } from "./hierarchy.js";
import { Transform } from "./transform.js";
import { GlobalTransform } from "./global_transform.js";
import {
  copyTrs,
  mat4Identity,
  mat4Invert,
  mat4Multiply,
  mat4ToTrs,
  trsToMat4,
} from "./math_trs.js";
import { system } from "./system.js";
import type { TransformData } from "./transform.js";

const tmpLocal = mat4Identity();
const tmpParent = mat4Identity();
const tmpWorld = mat4Identity();
const tmpInv = mat4Identity();
const tmpTrs: TransformData = {
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
};

function trsEqual(a: TransformData, b: TransformData): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.rx === b.rx &&
    a.ry === b.ry &&
    a.rz === b.rz &&
    a.sx === b.sx &&
    a.sy === b.sy &&
    a.sz === b.sz
  );
}

function writeGlobal(world: World, entity: number, next: TransformData): void {
  if (!world.has(entity, GlobalTransform)) {
    world.add(entity, GlobalTransform({ ...next }) as never);
    return;
  }
  const global = world.get(entity, GlobalTransform)!;
  if (trsEqual(global, next)) return;
  copyTrs(next, global);
  world.markChanged(entity, GlobalTransform);
}

function propagateEntity(world: World, entity: number): void {
  const local = world.get(entity, Transform);
  if (!local) return;

  const parentComp = world.get(entity, Parent);
  if (parentComp && world.isAlive(parentComp.entity)) {
    const pg = world.get(parentComp.entity, GlobalTransform);
    if (pg) {
      trsToMat4(local, tmpLocal);
      trsToMat4(pg, tmpParent);
      mat4Multiply(tmpParent, tmpLocal, tmpWorld);
      mat4ToTrs(tmpWorld, tmpTrs);
      writeGlobal(world, entity, tmpTrs);
    } else {
      writeGlobal(world, entity, local);
    }
  } else {
    writeGlobal(world, entity, local);
  }
}

/**
 * Deterministic hierarchy propagation — iterative, parent before child.
 * Dirty flooding marks whole subtrees; selective BFS when coverage is small.
 */
export const transformPropagation = system({
  name: "transformPropagation",
  access: {
    read: [Parent, Transform, Children],
    write: [GlobalTransform],
  },
  run(world) {
    let missingGlobal = false;
    let transformCount = 0;
    for (const [e] of world.query(Transform)) {
      transformCount++;
      if (!world.has(e, GlobalTransform)) missingGlobal = true;
    }

    const storeDirty = world.isStoreDirty(Transform);
    const dirty = world.consumeHierarchyDirty();

    if (!missingGlobal && !storeDirty && dirty.size === 0) return;

    const useFull =
      missingGlobal ||
      storeDirty ||
      dirty.size > transformCount * 0.5;

    const queue: number[] = [];

    if (useFull) {
      for (const [e] of world.query(Transform)) {
        if (!world.has(e, Parent)) queue.push(e);
      }
      for (const [e, p] of world.query(Parent, Transform)) {
        if (!world.isAlive(p.entity) || !world.has(p.entity, Transform)) {
          if (!queue.includes(e)) queue.push(e);
        }
      }
    } else {
      for (const e of dirty) {
        if (!world.has(e, Transform)) continue;
        const p = world.parent(e);
        if (p === null || !dirty.has(p)) queue.push(e);
      }
    }

    const visited = new Set<number>();
    let qi = 0;
    while (qi < queue.length) {
      const entity = queue[qi++]!;
      if (visited.has(entity)) continue;
      visited.add(entity);

      propagateEntity(world, entity);

      for (const child of world.children(entity)) {
        if (!world.has(child, Transform)) continue;
        if (useFull || dirty.has(child)) queue.push(child);
      }
    }
  },
});

/** Recompute child local so GlobalTransform is preserved after reparent. */
export function recomputeLocalPreservingGlobal(
  world: World,
  child: number,
  newParent: number | null,
): void {
  const global =
    world.get(child, GlobalTransform) ?? world.get(child, Transform);
  const local = world.get(child, Transform);
  if (!global || !local) return;

  if (newParent === null || !world.isAlive(newParent)) {
    copyTrs(global, local);
    world.markChanged(child, Transform);
    return;
  }
  const pg =
    world.get(newParent, GlobalTransform) ?? world.get(newParent, Transform);
  if (!pg) {
    copyTrs(global, local);
    world.markChanged(child, Transform);
    return;
  }
  trsToMat4(global, tmpWorld);
  trsToMat4(pg, tmpParent);
  if (!mat4Invert(tmpParent, tmpInv)) {
    copyTrs(global, local);
    world.markChanged(child, Transform);
    return;
  }
  mat4Multiply(tmpInv, tmpWorld, tmpLocal);
  mat4ToTrs(tmpLocal, local);
  world.markChanged(child, Transform);
}
