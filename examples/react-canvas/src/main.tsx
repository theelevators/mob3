import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Update, Transform, setRotation, type App } from "mob3";
import { ThreeObject, ThreeScene } from "@mob3/three";
import { Mob3Canvas } from "@mob3/react";
import * as THREE from "three";

function Demo() {
  const [ready, setReady] = useState(false);

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <header style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #243044" }}>
        <strong>mob3 React canvas</strong>
        <span style={{ opacity: 0.7, marginLeft: "0.75rem" }}>
          StrictMode · dispose-safe · {ready ? "running" : "starting…"}
        </span>
      </header>
      <Mob3Canvas
        three={{ syncMode: "always" }}
        setup={(app: App) => {
          const scene = app.world.resource(ThreeScene);
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 1.2, 1.2),
            new THREE.MeshNormalMaterial(),
          );
          scene.add(mesh);
          const entity = app.world.spawn(Transform(), ThreeObject(mesh));

          scene.add(new THREE.AmbientLight(0x8899aa, 0.45));
          const light = new THREE.DirectionalLight(0xffffff, 1);
          light.position.set(3, 5, 2);
          scene.add(light);

          // Euler yaw spin — setRotation marks Transform dirty for sync.
          app.addSystem(Update, (world) => {
            setRotation(world, entity, 0.35, performance.now() / 1000, 0.15);
          });

          queueMicrotask(() => setReady(true));
          return () => setReady(false);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
