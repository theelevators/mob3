import {
  resource,
  COMPONENT_TYPE,
  IS_COMPONENT_TYPE,
  Transform,
  type TransformData,
  type ComponentType,
  type ComponentInstance,
} from "@mob3/core";
import type { Object3D, Scene, WebGLRenderer, Camera, PerspectiveCamera } from "three";

export type ThreeObjectData = {
  object: Object3D;
};

/**
 * Component holding a real THREE.Object3D.
 * The factory is also the component type identity used in queries/storage.
 *
 * @example
 * world.spawn(Transform(), ThreeObject(mesh));
 */
function createThreeObjectType(): ComponentType<ThreeObjectData> & {
  (object: Object3D): ComponentInstance<ThreeObjectData>;
  (partial?: Partial<ThreeObjectData>): ComponentInstance<ThreeObjectData>;
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
    return data as ComponentInstance<ThreeObjectData>;
  }) as ComponentType<ThreeObjectData> & {
    (object: Object3D): ComponentInstance<ThreeObjectData>;
    (partial?: Partial<ThreeObjectData>): ComponentInstance<ThreeObjectData>;
  };

  Object.defineProperty(factory, IS_COMPONENT_TYPE, { value: true });
  Object.defineProperty(factory, "id", { value: id });
  Object.defineProperty(factory, "defaults", { value: defaults });
  Object.defineProperty(factory, "isTag", { value: false });
  Object.defineProperty(factory, "name", { value: "ThreeObject" });
  factory.create = ((partial?: Partial<ThreeObjectData>) =>
    factory(partial)) as ComponentType<ThreeObjectData>["create"];

  return factory;
}

export const ThreeObject = createThreeObjectType();

export function threeObject(object: Object3D) {
  return ThreeObject(object);
}

export const ThreeScene = resource<Scene>("ThreeScene");
export const ThreeRenderer = resource<WebGLRenderer>("ThreeRenderer");
export const ThreeCamera = resource<Camera>("ThreeCamera");

export type ThreeSyncMode = "changed" | "always";

export type ThreePluginOptions = {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
  renderer?: WebGLRenderer;
  scene?: Scene;
  camera?: Camera;
  createDefaultCamera?: boolean;
  clearColor?: number;
  autoResize?: boolean;
  /**
   * Transform sync strategy.
   * - `"changed"` (default): only sync when GlobalTransform/Transform is dirty
   * - `"always"`: sync every frame (small scenes; avoids get-vs-getMut footgun)
   */
  syncMode?: ThreeSyncMode;
};

/** Runtime sync mode resource — set by ThreePlugin from options. */
export const ThreeSyncModeResource = resource<ThreeSyncMode>("ThreeSyncMode");

export { Transform, type TransformData };
export type { Object3D, Scene, WebGLRenderer, Camera, PerspectiveCamera };
