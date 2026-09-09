# Cookbook — Canvas in React (Strict Mode safe)

```tsx
import { useEffect, useRef } from "react";
import { App } from "mob3";
import { ThreePlugin, ThreeScene } from "@mob3/three/plugin";
import * as THREE from "three";

export function Mob3Canvas({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<App | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Strict Mode remounts once in dev — always dispose the previous app.
    appRef.current?.dispose();

    const app = new App()
      .addPlugin(
        ThreePlugin({
          canvas,
          // Small scenes / prototyping: avoid get-vs-getMut footguns
          syncMode: "always",
        }),
      )
      .run();

    appRef.current = app;

    // Canvas may be 0×0 on first layout — force a resize after paint.
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });

    return () => {
      app.dispose();
      if (appRef.current === app) appRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {children}
    </div>
  );
}
```

## Rules

1. **Dispose on unmount** — Strict Mode double-invokes effects in dev
2. **Don’t put the App in React state** — ref is enough
3. **Resize after mount** — measure layout before trusting camera aspect
4. Prefer `syncMode: "always"` until you’re sure every mutation uses `getMut` / helpers
