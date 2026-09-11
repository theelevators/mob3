import {
  App,
  Update,
  Startup,
  Time,
  Transform,
  component,
  type World,
} from "@mob3/core";
import {
  ThreePlugin,
  ThreeScene,
  ThreeObject,
} from "@mob3/three";
import * as THREE from "three";

const RotationSpeed = component({ y: 1 });
const Drift = component({ x: 0, z: 0 });

const CUBE_COUNT = 1000;

function setup(world: World) {
  const scene = world.resource(ThreeScene);

  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(8, 16, 10);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x6688aa, 0.35));

  const geometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);

  for (let i = 0; i < CUBE_COUNT; i++) {
    const col = i % 40;
    const row = Math.floor(i / 40);
    const hue = (i % 40) / 40;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.55, 0.5),
      roughness: 0.45,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    world.spawn(
      Transform({
        x: col - 19.5,
        y: Math.sin(i * 0.17) * 0.5,
        z: row - 12,
      }),
      RotationSpeed({ y: 0.4 + (i % 11) * 0.08 }),
      Drift({
        x: Math.sin(i * 0.21) * 0.4,
        z: Math.cos(i * 0.13) * 0.4,
      }),
      ThreeObject(mesh),
    );
  }
}

function rotateAndMove(world: World) {
  const { delta, elapsed } = world.resource(Time);

  for (const [, transform, speed, drift] of world.query(
    Transform,
    RotationSpeed,
    Drift,
  )) {
    transform.ry += speed.y * delta;
    transform.rx += speed.y * 0.35 * delta;
    transform.y = Math.sin(elapsed * 1.4 + transform.x * 0.35) * 0.65;
    transform.x += drift.x * delta * 0.15;
    transform.z += drift.z * delta * 0.15;
  }
}

const canvas = document.querySelector("#c") as HTMLCanvasElement;

new App()
  .addPlugin(
    ThreePlugin({
      canvas,
      antialias: true,
      clearColor: 0x0b0d10,
    }),
  )
  .addSystem(Startup, setup)
  .addSystem(Update, rotateAndMove)
  .run();
