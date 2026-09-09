import { App, Startup, Update, Time, Transform, component, type World } from "mob3";
import {
  ThreePlugin,
  ThreeScene,
  ThreeObject,
} from "@mob3/three";
import * as THREE from "three";

const Velocity = component({ x: 0, y: 0, z: 0 });

function setup(world: World) {
  const scene = world.resource(ThreeScene);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffe0c0, 1);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x3dbb8f }),
  );
  scene.add(mesh);

  world.spawn(
    Transform({ x: -4, y: 0, z: 0 }),
    Velocity({ x: 2.5, y: 0, z: 0 }),
    ThreeObject(mesh),
  );
}

function movement(world: World) {
  const { delta } = world.resource(Time);
  for (const [, transform, velocity] of world.query(Transform, Velocity)) {
    transform.x += velocity.x * delta;
    if (transform.x > 4) velocity.x = -Math.abs(velocity.x);
    if (transform.x < -4) velocity.x = Math.abs(velocity.x);
  }
}

new App()
  .addPlugin(ThreePlugin({ canvas: document.querySelector("#c") as HTMLCanvasElement }))
  .addSystem(Startup, setup)
  .addSystem(Update, movement)
  .run();
