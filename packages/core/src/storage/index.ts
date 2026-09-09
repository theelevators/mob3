import type { ComponentType } from "../component.js";
import type { ComponentStorage } from "./types.js";
import { ObjectStorage } from "./object_storage.js";
import { createPackedStorage } from "./packed_storage.js";
import { createSharedPackedStorage } from "./shared_packed.js";
import { getPackedMeta } from "./packed_component.js";

export function createStorageFor(type: ComponentType): ComponentStorage {
  if (type.isTag) {
    // Tags still use ObjectStorage with sentinel true — same as today
    return new ObjectStorage();
  }
  const meta = getPackedMeta(type);
  if (!meta) return new ObjectStorage();
  if (meta.shared) {
    return createSharedPackedStorage(meta);
  }
  return createPackedStorage(meta, meta.capacity > 16 ? meta.capacity : 16);
}

export type { ComponentStorage } from "./types.js";
export { ObjectStorage } from "./object_storage.js";
export { PackedStorage, createPackedStorage } from "./packed_storage.js";
export {
  SharedPackedStorage,
  createSharedPackedStorage,
  sharedArrayBufferAvailable,
  columnsFromDescriptor,
  type SharedStoreDescriptor,
} from "./shared_packed.js";
export {
  packedComponent,
  getPackedMeta,
  isPackedComponent,
  f32,
  f64,
  i32,
  u32,
  PACKED_META,
  type PackedComponentOptions,
  type PackedComponentType,
} from "./packed_component.js";
export {
  type FieldKind,
  type FieldSchema,
  type InferSchema,
  type StorageKind,
  type PackedComponentMeta,
} from "./types.js";
