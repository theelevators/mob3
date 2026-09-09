# Cookbook — Minimal ThreePlugin scene

```ts
import { App, Transform, Update, setTranslation } from "mob3";
import { ThreePlugin, ThreeObject, ThreeScene } from "@mob3/three/plugin";
import * as THREE from "three";

const app = new App().addPlugin(
  ThreePlugin({ syncMode: "changed" /* or "always" for tiny scenes */ }),
);

const scene = app.world.resource(ThreeScene);
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial(),
);
scene.add(mesh);

const cube = app.world.spawn(Transform(), ThreeObject(mesh));

app.addSystem(Update, (world) => {
  // get() + field write does NOT dirty — use helpers or getMut:
  setTranslation(world, cube, Math.sin(performance.now() / 500), 0, 0);
  // or: world.mutate(cube, Transform, (t) => { t.y += 0.01; });
});

app.run();
```

## Entries

| Import | Use |
|--------|-----|
| `mob3` | Browser-safe ECS (default) |
| `mob3/parallel` | Workers / `installParallel` |
| `mob3/node` | Full Node entry |
| `@mob3/three/plugin` | Renderer sync only |
| `@mob3/three/gltf` | GLTF assets |
| `@mob3/three/animation` | Mixers / bone attachments |
