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
  gltfDataFromObject3DWithClips,
  type InstantiateGltfOptions,
  type AssetInstanceRefData,
} from "./assets/instantiate.js";

export {
  ThreeAssetsPlugin,
  type ThreeAssetsPluginOptions,
} from "./assets/plugin.js";
