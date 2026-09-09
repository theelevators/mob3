import {
  component,
  resource,
  COMPONENT_TYPE,
  IS_COMPONENT_TYPE,
  type ComponentType,
} from "mob3";
import type { Object3D, Scene, WebGLRenderer, Camera, PerspectiveCamera } from "three";

/** Local ECS transform. Authority direction: ECS → Three. */
export type TransformData = {
  x: number;
  y: number;
  z: number;
  /** Rotation Euler radians */
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
};

export const Transform = component<TransformData>({
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
});

export type ThreeObjectData = {
  object: Object3D;
};

/**
 * Component holding a real THREE.Object3D.
 * The factory is also the component type identity used in queries/storage.
 *
 * @example
 * world.spawn(Transform(), ThreeObject(mesh));
 * world.spawn(Transform(), ThreeObject({ object: mesh }));
 */
function createThreeObjectType(): ComponentType<ThreeObjectData> & {
  (object: Object3D): ThreeObjectData;
  (partial?: Partial<ThreeObjectData>): ThreeObjectData;
} {
  const defaults: ThreeObjectData = {
    object: null as unknown as Object3D,
  };
  const id = Symbol("mob3.ThreeObject");

  const factory = ((arg?: Object3D | Partial<ThreeObjectData>) => {
    let data: ThreeObjectData;
    if (arg && typeof arg === "object" && "isObject3D" in arg) {
      data = { object: arg as Object3D };
    } else {
      data = { ...defaults, ...(arg as Partial<ThreeObjectData> | undefined) };
    }
    Object.defineProperty(data, COMPONENT_TYPE, {
      value: factory,
      enumerable: false,
      configurable: true,
    });
    return data;
  }) as ComponentType<ThreeObjectData> & {
    (object: Object3D): ThreeObjectData;
    (partial?: Partial<ThreeObjectData>): ThreeObjectData;
  };

  Object.defineProperty(factory, IS_COMPONENT_TYPE, { value: true });
  Object.defineProperty(factory, "id", { value: id });
  Object.defineProperty(factory, "defaults", { value: defaults });
  Object.defineProperty(factory, "isTag", { value: false });
  factory.create = ((partial?: Partial<ThreeObjectData>) =>
    factory(partial)) as ComponentType<ThreeObjectData>["create"];

  return factory;
}

export const ThreeObject = createThreeObjectType();

/** Helper alias. */
export function threeObject(object: Object3D) {
  return ThreeObject(object);
}

export const ThreeScene = resource<Scene>("ThreeScene");
export const ThreeRenderer = resource<WebGLRenderer>("ThreeRenderer");
export const ThreeCamera = resource<Camera>("ThreeCamera");

export type ThreePluginOptions = {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
  /** Provide an existing renderer instead of creating one. */
  renderer?: WebGLRenderer;
  /** Provide an existing scene. */
  scene?: Scene;
  /** Provide an existing camera. */
  camera?: Camera;
  /** Create a default PerspectiveCamera when none is supplied. Default true. */
  createDefaultCamera?: boolean;
  /** Clear color (hex). Default 0x111111. */
  clearColor?: number;
  /** Auto-resize renderer to canvas client size. Default true. */
  autoResize?: boolean;
};

export type { Object3D, Scene, WebGLRenderer, Camera, PerspectiveCamera };
