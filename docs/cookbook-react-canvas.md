# Cookbook — Canvas in React (Strict Mode safe)

Prefer **`@mob3/react`** over hand-rolled effects.

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Update, Transform, setRotation } from "@mob3/core";
import { ThreeObject, ThreeScene } from "@mob3/three";
import { Mob3Canvas } from "@mob3/react";
import * as THREE from "three";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Mob3Canvas
      three={{ syncMode: "always" }}
      setup={(app) => {
        const scene = app.world.resource(ThreeScene);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshNormalMaterial(),
        );
        scene.add(mesh);
        const e = app.world.spawn(Transform(), ThreeObject(mesh));
        app.addSystem(Update, (world) => {
          setRotation(world, e, 0, performance.now() / 1000, 0);
        });
      }}
    />
  </StrictMode>,
);
```

Or the hook:

```tsx
function View() {
  const { app, canvasRef } = useMob3App({
    three: { syncMode: "always" },
    setup(app) { /* spawn once */ },
  });
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}
```

## Rules

1. **Dispose on unmount** — `@mob3/react` handles Strict Mode double-invoke
2. **Don’t put `App` in React state** — the hook keeps it in a ref; `app` in render is for reads only
3. **Resize after mount** — built-in `requestResizeOnMount`
4. Prefer `syncMode: "always"` until every mutation uses `getMut` / helpers

See `examples/react-canvas`.
