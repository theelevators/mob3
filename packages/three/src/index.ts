export {
  Transform,
  ThreeObject,
  threeObject,
  ThreeScene,
  ThreeRenderer,
  ThreeCamera,
  type TransformData,
  type ThreePluginOptions,
} from "./components.js";

export {
  ThreePlugin,
  syncTransforms,
  renderFrame,
  detachPendingThreeObjects,
} from "./plugin.js";

export {
  GltfAsset,
  createGltfLoader,
  minimalBoxGltfJson,
  type GltfAssetData,
  type GltfLoaderOptions,
} from "./assets/gltf.js";

export {
  instantiateGltf,
  despawnGltfInstance,
  releaseGltfInstance,
  AssetInstanceRef,
  gltfDataFromObject3D,
  type InstantiateGltfOptions,
  type AssetInstanceRefData,
} from "./assets/instantiate.js";

export {
  ThreeAssetsPlugin,
  type ThreeAssetsPluginOptions,
} from "./assets/plugin.js";
