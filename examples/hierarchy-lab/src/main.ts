/**
 * Hierarchy Lab — pressure-test parent/child + GlobalTransform + change sync.
 */
import {
  App,
  Startup,
  Update,
  PostUpdate,
  PostRender,
  Name,
  Transform,
  GlobalTransform,
  transformPropagation,
  type World,
  type Entity,
  type HierarchyPreserve,
} from "mob3";
import {
  ThreePlugin,
  ThreeScene,
  ThreeObject,
  ThreeCamera,
} from "@mob3/three";
import * as THREE from "three";

type Lab = {
  sun: Entity;
  planetA: Entity;
  planetB: Entity;
  moonA: Entity;
  satellite: Entity;
  station: Entity;
  moonB: Entity;
  cameraRig: Entity;
};

const lab: Partial<Lab> = {};
let preserve: HierarchyPreserve = "local";
let paused = false;
let lastChanged = 0;

function ball(
  scene: THREE.Scene,
  color: number,
  radius: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
  );
  scene.add(mesh);
  return mesh;
}

function setupScene(world: World): void {
  const scene = world.resource(ThreeScene);
  scene.add(new THREE.AmbientLight(0x8899aa, 0.45));
  const sunLight = new THREE.PointLight(0xffeeaa, 2.2, 80);
  scene.add(sunLight);

  const sunMesh = ball(scene, 0xffcc44, 1.4);
  lab.sun = world.spawn(
    Name({ value: "Sun" }),
    Transform(),
    ThreeObject(sunMesh),
  );

  const planetAMesh = ball(scene, 0x4488ff, 0.55);
  lab.planetA = world.spawnChild(
    lab.sun,
    Name({ value: "PlanetA" }),
    Transform({ x: 6 }),
    ThreeObject(planetAMesh),
  );

  const moonAMesh = ball(scene, 0xbbbbcc, 0.22);
  lab.moonA = world.spawnChild(
    lab.planetA,
    Name({ value: "MoonA" }),
    Transform({ x: 1.4 }),
    ThreeObject(moonAMesh),
  );

  const satMesh = ball(scene, 0xff6644, 0.1);
  lab.satellite = world.spawnChild(
    lab.moonA,
    Name({ value: "Satellite" }),
    Transform({ x: 0.45 }),
    ThreeObject(satMesh),
  );

  const stationMesh = ball(scene, 0x66cc88, 0.18);
  lab.station = world.spawnChild(
    lab.planetA,
    Name({ value: "Station" }),
    Transform({ z: 1.2 }),
    ThreeObject(stationMesh),
  );

  const planetBMesh = ball(scene, 0xcc66aa, 0.4);
  lab.planetB = world.spawnChild(
    lab.sun,
    Name({ value: "PlanetB" }),
    Transform({ x: -5, z: 2 }),
    ThreeObject(planetBMesh),
  );

  const moonBMesh = ball(scene, 0x99aacc, 0.16);
  lab.moonB = world.spawnChild(
    lab.planetB,
    Name({ value: "MoonB" }),
    Transform({ y: 1.1 }),
    ThreeObject(moonBMesh),
  );

  lab.cameraRig = world.spawn(
    Name({ value: "CameraRig" }),
    Transform({ x: 0, y: 8, z: 18 }),
  );
  const cam = world.resource(ThreeCamera);
  world.spawnChild(
    lab.cameraRig,
    Name({ value: "Camera" }),
    Transform(),
    ThreeObject(cam),
  );
}

function orbit(world: World, dt: number): void {
  if (!lab.planetA || !lab.planetB || !lab.moonA || !lab.moonB) return;
  if (world.isAlive(lab.planetA)) {
    const pa = world.getMut(lab.planetA, Transform);
    if (pa) pa.ry += dt * 0.35;
  }
  if (world.isAlive(lab.planetB)) {
    const pb = world.getMut(lab.planetB, Transform);
    if (pb) pb.ry -= dt * 0.22;
  }
  if (world.isAlive(lab.moonA)) {
    const ma = world.getMut(lab.moonA, Transform);
    if (ma) ma.ry += dt * 1.1;
  }
  if (world.isAlive(lab.moonB)) {
    const mb = world.getMut(lab.moonB, Transform);
    if (mb) mb.ry += dt * 0.9;
  }
}

function refreshHud(world: World): void {
  const tree = document.getElementById("tree");
  const changedEl = document.getElementById("changed");
  if (tree) tree.textContent = world.formatHierarchy();
  if (changedEl) changedEl.textContent = String(lastChanged);
}

function wireUi(app: App): void {
  const preserveEl = document.getElementById("preserve") as HTMLSelectElement;
  preserveEl?.addEventListener("change", () => {
    preserve = preserveEl.value as HierarchyPreserve;
  });
  document.getElementById("paused")?.addEventListener("change", (e) => {
    paused = (e.target as HTMLInputElement).checked;
  });

  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act!;
      const w = app.world;
      const opts = { preserve };
      if (act === "reparent-moona" && lab.satellite && lab.moonA) {
        if (w.isAlive(lab.moonA) && w.isAlive(lab.satellite)) {
          w.setParent(lab.satellite, lab.moonA, opts);
        }
      } else if (act === "reparent-planeta" && lab.satellite && lab.planetA) {
        if (w.isAlive(lab.planetA) && w.isAlive(lab.satellite)) {
          w.setParent(lab.satellite, lab.planetA, opts);
        }
      } else if (act === "reparent-root" && lab.satellite) {
        if (w.isAlive(lab.satellite)) w.setParent(lab.satellite, null, opts);
      } else if (act === "despawn-cascade" && lab.planetA) {
        if (w.isAlive(lab.planetA)) {
          w.despawn(lab.planetA, { hierarchy: "cascade" });
        }
      } else if (act === "despawn-detach" && lab.planetB) {
        if (w.isAlive(lab.planetB)) {
          w.despawn(lab.planetB, { hierarchy: "detach" });
        }
      } else if (act === "mutate-branch" && lab.sun) {
        if (w.isAlive(lab.sun)) {
          w.getMut(lab.sun, Transform)!.ry += 0.4;
        }
      } else if (act === "spawn-moon" && lab.planetB) {
        if (w.isAlive(lab.planetB)) {
          const scene = w.resource(ThreeScene);
          const mesh = ball(scene, 0xaaddff, 0.12);
          w.spawnChild(
            lab.planetB,
            Name({ value: "MoonNew" }),
            Transform({
              x: 0.8 + Math.random(),
              y: Math.random() - 0.5,
            }),
            ThreeObject(mesh),
          );
        }
      } else if (act === "inspect" && lab.satellite) {
        const tree = document.getElementById("tree");
        if (tree && w.isAlive(lab.satellite)) {
          tree.textContent =
            w.formatHierarchy() +
            "\n\n" +
            JSON.stringify(w.inspect(lab.satellite), null, 2);
        }
      }
      refreshHud(w);
    });
  });
}

const canvas = document.getElementById("c") as HTMLCanvasElement;

const app = new App()
  .addPlugin(
    ThreePlugin({
      canvas,
      clearColor: 0x0e1218,
      createDefaultCamera: true,
    }),
  )
  .addSystem(Startup, setupScene)
  .addSystem(Update, (world) => {
    if (!paused) orbit(world, 1 / 60);
  })
  .addSystem(
    PostUpdate,
    (world) => {
      lastChanged = 0;
      for (const _ of world.query(GlobalTransform).changed(GlobalTransform)) {
        lastChanged++;
      }
    },
    { after: transformPropagation },
  )
  .addSystem(PostRender, (world) => {
    refreshHud(world);
  });

wireUi(app);

function frame(): void {
  app.update(1 / 60);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
