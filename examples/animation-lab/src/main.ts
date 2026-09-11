/**
 * Animation Lab — Phase 11 pressure demo.
 * One procedural Character asset → A/B/C independent playback + sword bone attach.
 */
import {
  App,
  Startup,
  Update,
  Name,
  Transform,
  GlobalTransform,
  type Entity,
} from "@mob3/core";
import { getAssets } from "@mob3/assets";
import {
  ThreeAssetsPlugin,
  ThreePlugin,
  ThreeObject,
  ThreeScene,
  ThreeCamera,
  GltfAsset,
  createGltfLoader,
  AnimationPlugin,
  AnimationPlayer,
  AnimationFinished,
  BoneAttachment,
  instantiateAnimatedGltf,
  despawnAnimatedGltf,
  createProceduralCharacterAsset,
  playAnimation,
  pauseAnimation,
  resumeAnimation,
  stopAnimation,
  crossfadeAnimation,
  inspectAnimation,
} from "@mob3/three";
import * as THREE from "three";
import type { AssetHandle } from "@mob3/assets";
import type { GltfAssetData } from "@mob3/three";

type Slot = {
  entity: Entity;
  sword: Entity | null;
  label: string;
};

const canvas = document.getElementById("c") as HTMLCanvasElement;
const slots: Slot[] = [];
let selected = 0;
let handle: AssetHandle<GltfAssetData> | null = null;
let nextX = -4;
const finishedLog: string[] = [];

function refresh(app: App): void {
  const el = document.getElementById("log");
  const sel = document.getElementById("sel");
  if (!el || !sel) return;
  sel.innerHTML = "";
  slots.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s.label;
    if (i === selected) b.classList.add("active");
    b.addEventListener("click", () => {
      selected = i;
      refresh(app);
    });
    sel.appendChild(b);
  });

  const lines: string[] = [];
  if (handle) {
    const assets = getAssets(app.world);
    lines.push(
      `asset=${handle.key} status=${assets.status(handle)} refs=${assets.refCount(handle)}`,
    );
    const data = assets.get(handle);
    if (data) {
      lines.push(`clips: ${data.clips.map((c) => c.name).join(", ")}`);
      lines.push(
        `geo=${data.geometries.size} mat=${data.materials.size} tex=${data.textures.size}`,
      );
    }
  }
  lines.push("", "instances:");
  for (const s of slots) {
    const info = inspectAnimation(app.world, s.entity);
    const t = app.world.get(s.entity, Transform);
    const time =
      typeof info?.time === "number" ? info.time.toFixed(2) : String(info?.time);
    lines.push(
      `  ${s.label} @ x=${t?.x.toFixed(1)} clip=${info?.clip} playing=${info?.playing} speed=${info?.speed} time=${time} loop=${info?.loop} sword=${s.sword != null}`,
    );
  }
  if (finishedLog.length) {
    lines.push("", "finished:", ...finishedLog.slice(-8).map((x) => `  ${x}`));
  }
  el.textContent = lines.join("\n");
}

function spawnCharacter(app: App, label: string, clip: string, speed = 1): Slot {
  if (!handle) throw new Error("no asset");
  const entity = instantiateAnimatedGltf(app.world, handle, {
    name: label,
    clip,
    loop: true,
  });
  app.world.getMut(entity, Transform)!.x = nextX;
  nextX += 4;
  playAnimation(app.world, entity, clip, { speed, fadeDuration: 0 });
  const slot: Slot = { entity, sword: null, label };
  slots.push(slot);
  selected = slots.length - 1;
  return slot;
}

function ensureSword(app: App, slot: Slot): void {
  if (slot.sword && app.world.isAlive(slot.sword)) return;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xc0c8d4 }),
  );
  mesh.name = `Sword-${slot.label}`;
  app.world.resource(ThreeScene).add(mesh);
  slot.sword = app.world.spawn(
    Name({ value: mesh.name }),
    Transform(),
    GlobalTransform(),
    ThreeObject(mesh),
    BoneAttachment({
      source: slot.entity,
      bone: "RightHand",
      oz: 0.25,
    }),
  );
}

function detachSword(app: App, slot: Slot): void {
  if (!slot.sword || !app.world.isAlive(slot.sword)) {
    slot.sword = null;
    return;
  }
  const three = app.world.get(slot.sword, ThreeObject);
  three?.object.removeFromParent();
  app.world.despawn(slot.sword);
  slot.sword = null;
}

const app = new App()
  .addPlugin(
    ThreePlugin({
      canvas,
      clearColor: 0x12151a,
      createDefaultCamera: true,
    }),
  )
  .addPlugin(ThreeAssetsPlugin())
  .addPlugin(AnimationPlugin())
  .addSystem(Startup, (world) => {
    const scene = world.resource(ThreeScene);
    scene.add(new THREE.AmbientLight(0x8899aa, 0.55));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(4, 8, 6);
    scene.add(light);
    const grid = new THREE.GridHelper(20, 20, 0x334155, 0x1e293b);
    scene.add(grid);

    const cam = world.resource(ThreeCamera);
    cam.position.set(0, 4, 10);
    cam.lookAt(0, 0.5, 0);

    const assets = getAssets(world);
    assets.registerLoader(GltfAsset, {
      ...createGltfLoader(),
      dispose(v) {
        createGltfLoader().dispose?.(v);
      },
    });
    const data = createProceduralCharacterAsset();
    handle = assets.insert(GltfAsset, "character.glb", data);

    spawnCharacter(app, "A", "Run", 1);
    spawnCharacter(app, "B", "Idle", 1);
    spawnCharacter(app, "C", "Walk", 0.5);
    ensureSword(app, slots[0]!);
    refresh(app);
  })
  .addSystem(Update, (world) => {
    for (const ev of world.events(AnimationFinished)) {
      finishedLog.push(`${ev.clip} @ ${ev.entity}`);
    }
    refresh(app);
  });

document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const act = btn.dataset.act!;
    const slot = slots[selected];
    if (!slot && act !== "spawn") return;

    if (act === "clip" && slot) {
      playAnimation(app.world, slot.entity, btn.dataset.v!, { fadeDuration: 0.2 });
    } else if (act === "pause" && slot) {
      pauseAnimation(app.world, slot.entity);
    } else if (act === "resume" && slot) {
      resumeAnimation(app.world, slot.entity);
    } else if (act === "stop" && slot) {
      stopAnimation(app.world, slot.entity);
    } else if (act === "speed" && slot) {
      const p = app.world.getMut(slot.entity, AnimationPlayer)!;
      p.speed = Number(btn.dataset.v);
    } else if (act === "loop" && slot) {
      const p = app.world.getMut(slot.entity, AnimationPlayer)!;
      p.loop = btn.dataset.v === "1";
    } else if (act === "crossfade" && slot) {
      crossfadeAnimation(app.world, slot.entity, "Run", 0.25);
    } else if (act === "spawn") {
      spawnCharacter(app, `X${slots.length}`, "Idle", 1);
    } else if (act === "despawn" && slot) {
      detachSword(app, slot);
      despawnAnimatedGltf(app.world, slot.entity);
      slots.splice(selected, 1);
      selected = Math.max(0, slots.length - 1);
    } else if (act === "attach" && slot) {
      ensureSword(app, slot);
    } else if (act === "detach" && slot) {
      detachSword(app, slot);
    }
    refresh(app);
  });
});

function frame(t: number): void {
  const last = (frame as { last?: number }).last ?? t;
  (frame as { last?: number }).last = t;
  app.update(Math.min(0.05, (t - last) / 1000));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
