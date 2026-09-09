/**
 * Browser Mob Arena — Input + Rapier + Three + gameplay.
 */
import { Startup, Update, type World } from "mob3";
import { InputPlugin } from "@mob3/input";
import { initRapier, RapierPlugin } from "@mob3/rapier";
import {
  ThreePlugin,
  ThreeScene,
  ThreeObject,
  ThreeCamera,
  detachPendingThreeObjects,
} from "@mob3/three";
import * as THREE from "three";
import { App, FixedUpdate } from "mob3";
import { MobArenaPlugin, despawnPending } from "./systems.js";
import {
  Transform,
  Enemy,
  Projectile,
  Health,
  Score,
  GameMeta,
  Player,
  PendingDespawn,
} from "./components.js";

const canvas = document.querySelector("#c") as HTMLCanvasElement;
const hud = document.querySelector("#hud") as HTMLDivElement;

await initRapier();

const app = new App()
  .addPlugin(InputPlugin({ preventDefault: ["Space"] }))
  .addPlugin(RapierPlugin({ gravity: { x: 0, y: 0, z: 0 } }))
  .addPlugin(
    ThreePlugin({
      canvas,
      antialias: true,
      clearColor: 0x0a0c10,
    }),
  )
  .addPlugin(MobArenaPlugin({ seed: 7 }));

// Ensure despawn runs after Three detach (Three registers detach; order it)
app.order(FixedUpdate, detachPendingThreeObjects, {
  before: despawnPending,
});
app.order(Update, detachPendingThreeObjects, {
  before: despawnPending,
});

const enemyGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const projectileGeo = new THREE.SphereGeometry(0.22, 8, 8);
const playerGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);

function setupVisuals(world: World): void {
  const scene = world.resource(ThreeScene);
  const camera = world.resource(ThreeCamera);
  camera.position.set(0, 22, 26);
  if ("lookAt" in camera) {
    (camera as THREE.PerspectiveCamera).lookAt(0, 0, 0);
  }

  scene.add(new THREE.HemisphereLight(0xb1c7ff, 0x223311, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 20, 10);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const meta = world.resource(GameMeta);
  const mesh = new THREE.Mesh(
    playerGeo,
    new THREE.MeshStandardMaterial({ color: 0x4ecdc4 }),
  );
  scene.add(mesh);
  world.add(meta.player, ThreeObject(mesh));
}

function attachMeshes(world: World): void {
  const scene = world.resource(ThreeScene);
  for (const [entity] of world.query(Transform).with(Enemy).without(PendingDespawn)) {
    if (world.has(entity, ThreeObject)) continue;
    const mesh = new THREE.Mesh(
      enemyGeo,
      new THREE.MeshStandardMaterial({ color: 0xff6b6b }),
    );
    scene.add(mesh);
    world.add(entity, ThreeObject(mesh));
  }
  for (const [entity] of world
    .query(Transform)
    .with(Projectile)
    .without(PendingDespawn)) {
    if (world.has(entity, ThreeObject)) continue;
    const mesh = new THREE.Mesh(
      projectileGeo,
      new THREE.MeshStandardMaterial({ color: 0xffe66d }),
    );
    scene.add(mesh);
    world.add(entity, ThreeObject(mesh));
  }
}

function updateHud(world: World): void {
  const score = world.resource(Score);
  const meta = world.resource(GameMeta);
  const health = world.get(meta.player, Health)?.value ?? 0;
  hud.textContent = meta.gameOver
    ? `GAME OVER — kills ${score.kills} — press R to restart`
    : `HP ${Math.ceil(health)} · kills ${score.kills} · entities ${world.entityCount()} · WASD move · Space shoot · R restart`;
}

app.addSystem(Startup, setupVisuals); // opaque: immediate world.add + scene graph
app.addSystem(FixedUpdate, attachMeshes, { before: despawnPending }); // opaque: world.add
app.addSystem(Update, updateHud); // opaque: DOM side effect

app.run();

void Player;
