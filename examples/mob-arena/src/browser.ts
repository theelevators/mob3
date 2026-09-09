/**
 * Browser Mob Arena — keyboard + Three.js visuals on the shared simulation.
 */
import { Startup, FixedUpdate, Update, type World, type Commands } from "mob3";
import { ThreePlugin, ThreeScene, ThreeObject, ThreeCamera } from "@mob3/three";
import * as THREE from "three";
import { createGame } from "./game.js";
import {
  Transform,
  Enemy,
  Projectile,
  Health,
  Input,
  Score,
  GameMeta,
  PendingDespawn,
} from "./components.js";
import { despawnPending } from "./systems.js";

const canvas = document.querySelector("#c") as HTMLCanvasElement;
const hud = document.querySelector("#hud") as HTMLDivElement;

const game = createGame({ seed: 7, autoDespawn: false });
const { app, world } = game;

app.addPlugin(
  ThreePlugin({
    canvas,
    antialias: true,
    clearColor: 0x0a0c10,
  }),
);

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

function attachMeshes(world: World, commands: Commands): void {
  const scene = world.resource(ThreeScene);

  for (const [entity] of world.query(Transform).with(Enemy).without(PendingDespawn)) {
    if (world.has(entity, ThreeObject)) continue;
    const mesh = new THREE.Mesh(
      enemyGeo,
      new THREE.MeshStandardMaterial({ color: 0xff6b6b }),
    );
    scene.add(mesh);
    commands.add(entity, ThreeObject(mesh));
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
    commands.add(entity, ThreeObject(mesh));
  }
}

function detachPendingMeshes(world: World): void {
  for (const [, three] of world.query(ThreeObject).with(PendingDespawn)) {
    three.object.removeFromParent();
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

function bindKeyboard(world: World): void {
  const input = world.resource(Input);
  const setKey = (code: string, down: boolean) => {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        input.up = down;
        break;
      case "KeyS":
      case "ArrowDown":
        input.down = down;
        break;
      case "KeyA":
      case "ArrowLeft":
        input.left = down;
        break;
      case "KeyD":
      case "ArrowRight":
        input.right = down;
        break;
      case "Space":
        if (down && !input.fire) input.firePressed = true;
        input.fire = down;
        break;
      case "KeyR":
        if (down && !input.restart) input.restartPressed = true;
        input.restart = down;
        break;
    }
  };
  window.addEventListener("keydown", (e) => {
    setKey(e.code, true);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => setKey(e.code, false));
}

bindKeyboard(world);

app.addSystem(Startup, setupVisuals);
app.addSystem(FixedUpdate, attachMeshes);
app.addSystem(FixedUpdate, detachPendingMeshes);
app.addSystem(FixedUpdate, despawnPending);
app.addSystem(Update, detachPendingMeshes);
app.addSystem(Update, despawnPending);
app.addSystem(Update, updateHud);

app.run();
