/** Minimal Three plugin surface — no GLTF/animation. */
export {
  Transform,
  ThreeObject,
  threeObject,
  ThreeScene,
  ThreeRenderer,
  ThreeCamera,
  ThreeSyncModeResource,
  type TransformData,
  type ThreeObjectData,
  type ThreePluginOptions,
  type ThreeSyncMode,
} from "./components.js";

export {
  ThreePlugin,
  syncTransforms,
  renderFrame,
  detachPendingThreeObjects,
} from "./plugin.js";
