# Cookbook — Audio visualizer sketch (stems as entities)

```ts
import { App, Transform, Update, resource, component, tag, setScale } from "mob3";
import { ThreePlugin, ThreeObject, ThreeScene } from "@mob3/three/plugin";
import * as THREE from "three";

const Stem = tag("Stem");
const StemVisual = component({ hue: 0 }, "StemVisual");
const MixState = resource<{ levels: Float32Array }>("MixState");

const app = new App().addPlugin(ThreePlugin({ syncMode: "always" }));
const scene = app.world.resource(ThreeScene);

app.world.insertResource(MixState, { levels: new Float32Array(8) });

for (let i = 0; i < 8; i++) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1, 0.4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 8, 0.7, 0.5) }),
  );
  mesh.position.x = (i - 3.5) * 0.6;
  scene.add(mesh);
  app.world.spawn(
    Stem,
    StemVisual({ hue: i / 8 }),
    Transform({ x: mesh.position.x }),
    ThreeObject(mesh),
  );
}

// Audio thread / analyser writes MixState.levels each frame (omitted).

app.addSystem(Update, (world) => {
  const mix = world.resource(MixState);
  let i = 0;
  for (const [e] of world.query(Stem)) {
    const level = mix.levels[i++] ?? 0;
    setScale(world, e, 1, 0.2 + level * 2, 1);
  }
});

app.run();
```

Keep analyser ownership outside ECS (or as a resource updater). Systems only map **levels → Transform**.
