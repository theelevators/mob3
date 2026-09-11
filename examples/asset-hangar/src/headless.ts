/**
 * Headless hangar — insert ship, instantiate 3×, despawn one, unload.
 */
import { App, Transform } from "@mob3/core";
import { AssetsPlugin, getAssets } from "@mob3/assets";
import {
  GltfAsset,
  createGltfLoader,
  instantiateGltf,
  despawnGltfInstance,
  gltfDataFromObject3D,
} from "@mob3/three";
import * as THREE from "three";

function buildShip(): THREE.Group {
  const root = new THREE.Group();
  root.name = "Ship";
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  const body = new THREE.Mesh(geo, mat);
  body.name = "Body";
  root.add(body);
  return root;
}

const app = new App().addPlugin(AssetsPlugin({ json: false }));
const assets = getAssets(app.world);
const data = gltfDataFromObject3D(buildShip());
assets.registerLoader(GltfAsset, {
  async load() {
    throw new Error("unused");
  },
  dispose(v) {
    createGltfLoader().dispose?.(v);
  },
});

const handle = assets.insert(GltfAsset, "ship.glb", data);
const a = instantiateGltf(app.world, handle);
const b = instantiateGltf(app.world, handle);
const c = instantiateGltf(app.world, handle);
app.world.getMut(b, Transform)!.x = 3;
app.update(1 / 60);

despawnGltfInstance(app.world, b);
expectAlive(a, true);
expectAlive(c, true);
expectAlive(b, false);
expect(data.disposeCounts.geometry).toBe(0);

despawnGltfInstance(app.world, a);
despawnGltfInstance(app.world, c);
while (assets.refCount(handle) > 0) {
  assets.release(handle, { unload: assets.refCount(handle) === 1 });
}
if (assets.status(handle) !== "absent") assets.unload(handle);

console.log(
  JSON.stringify(
    {
      mode: "headless-asset-hangar",
      disposeCounts: data.disposeCounts,
      registry: assets.formatRegistry(),
      ok: data.disposeCounts.geometry === 1 && data.disposeCounts.material === 1,
    },
    null,
    2,
  ),
);

app.dispose();

function expectAlive(e: number, alive: boolean): void {
  if (app.world.isAlive(e) !== alive) {
    throw new Error(`entity ${e} alive=${app.world.isAlive(e)} expected ${alive}`);
  }
}
function expect(v: unknown): { toBe: (x: unknown) => void } {
  return {
    toBe(x) {
      if (v !== x) throw new Error(`expected ${x} got ${v}`);
    },
  };
}
