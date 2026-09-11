/**
 * Asset Hangar — lifecycle pressure test for Phase 10.
 * Uses an inserted generated “ship” GltfAsset (no CDN).
 */
import { App, Startup, Update, Name, Transform } from "@mob3/core";
import { getAssets, AssetReady, AssetFailed } from "@mob3/assets";
import {
  ThreePlugin,
  ThreeAssetsPlugin,
  ThreeScene,
  GltfAsset,
  createGltfLoader,
  instantiateGltf,
  despawnGltfInstance,
  gltfDataFromObject3D,
} from "@mob3/three";
import * as THREE from "three";
import type { AssetHandle } from "@mob3/assets";
import type { GltfAssetData } from "@mob3/three";
import type { Entity } from "@mob3/core";

function buildShip(): THREE.Group {
  const root = new THREE.Group();
  root.name = "Ship";
  const geo = new THREE.BoxGeometry(1.2, 0.4, 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a8fd4, metalness: 0.3, roughness: 0.45 });
  const body = new THREE.Mesh(geo, mat);
  body.name = "Body";
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.6), mat);
  wing.name = "Wing";
  wing.position.set(0, 0.1, 0.2);
  root.add(body);
  root.add(wing);
  return root;
}

let ship: AssetHandle<GltfAssetData> | null = null;
let broken: AssetHandle<GltfAssetData> | null = null;
const instances: Entity[] = [];
let nextX = -4;

function refresh(app: App): void {
  const el = document.getElementById("log");
  if (!el) return;
  const assets = getAssets(app.world);
  const lines = [assets.formatRegistry(), "", "Instances:"];
  for (const e of instances) {
    lines.push(`  ${app.world.entityLabel(e)}`);
  }
  if (ship) {
    lines.push("", `ship status=${assets.status(ship)} refs=${assets.refCount(ship)}`);
  }
  if (broken) {
    lines.push(`broken status=${assets.status(broken)} err=${assets.error(broken)?.message ?? ""}`);
  }
  el.textContent = lines.join("\n");
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const app = new App()
  .addPlugin(
    ThreePlugin({
      canvas,
      clearColor: 0x10141c,
      createDefaultCamera: true,
    }),
  )
  .addPlugin(ThreeAssetsPlugin())
  .addSystem(Startup, (world) => {
    const scene = world.resource(ThreeScene);
    scene.add(new THREE.AmbientLight(0x8899aa, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(6, 10, 4);
    scene.add(light);
    world.spawn(Name({ value: "Hangar" }), Transform());

    const assets = getAssets(world);
    assets.registerLoader(GltfAsset, {
      ...createGltfLoader(),
      dispose(v) {
        createGltfLoader().dispose?.(v);
      },
    });
  })
  .addSystem(Update, (world) => {
    for (const _ of world.events(AssetReady)) refresh(app);
    for (const _ of world.events(AssetFailed)) refresh(app);
  });

document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const act = btn.dataset.act!;
    const assets = getAssets(app.world);
    if (act === "load") {
      if (ship && assets.status(ship) !== "absent") {
        assets.retain(ship);
      } else {
        const data = gltfDataFromObject3D(buildShip());
        ship = assets.insert(GltfAsset, "ship.glb", data);
      }
    } else if (act === "spawn" && ship && assets.isReady(ship)) {
      const root = instantiateGltf(app.world, ship, { name: `Ship-${instances.length}` });
      app.world.getMut(root, Transform)!.x = nextX;
      nextX += 3;
      instances.push(root);
    } else if (act === "despawn" && instances.length) {
      const e = instances.pop()!;
      despawnGltfInstance(app.world, e);
    } else if (act === "unload" && ship) {
      while (assets.refCount(ship) > 0) {
        assets.release(ship, { unload: assets.refCount(ship) === 1 });
      }
      if (assets.status(ship) !== "absent") assets.unload(ship);
      ship = null;
      instances.length = 0;
    } else if (act === "broken") {
      assets.registerLoader(GltfAsset, {
        async load() {
          throw new Error("intentionally broken");
        },
      });
      broken = assets.load(GltfAsset, "broken.glb");
    } else if (act === "retry" && broken) {
      assets.registerLoader(GltfAsset, {
        async load() {
          return gltfDataFromObject3D(buildShip());
        },
        dispose(v) {
          createGltfLoader().dispose?.(v);
        },
      });
      broken = assets.reload(broken);
    }
    refresh(app);
  });
});

function frame(): void {
  app.update(1 / 60);
  requestAnimationFrame(frame);
}
refresh(app);
requestAnimationFrame(frame);
