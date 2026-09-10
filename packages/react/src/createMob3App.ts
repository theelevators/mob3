import { App } from "mob3";
import { ThreePlugin, type ThreePluginOptions } from "@mob3/three";
import type { Mob3AppHandle, UseMob3AppOptions } from "./types.js";

/**
 * Create + configure a mob3 App for a canvas.
 * Framework-agnostic so hooks and tests share one path.
 */
export function createMob3App(
  canvas: HTMLCanvasElement | null | undefined,
  options: UseMob3AppOptions = {},
): Mob3AppHandle {
  const {
    three = true,
    plugins = [],
    setup,
    run = true,
    requestResizeOnMount = true,
  } = options;

  const app = new App();

  if (three !== false) {
    if (!canvas) {
      throw new Error(
        "createMob3App: canvas is required when three integration is enabled",
      );
    }
    const threeOpts: ThreePluginOptions =
      three === true ? { canvas } : { canvas, ...three };
    app.addPlugin(
      ThreePlugin({
        autoResize: true,
        syncMode: "always",
        ...threeOpts,
        canvas,
      }),
    );
  }

  for (const plugin of plugins) {
    app.addPlugin(plugin);
  }

  let cleanup: (() => void) | undefined;
  if (setup) {
    const result = setup(app);
    if (typeof result === "function") cleanup = result;
  }

  if (run) {
    app.run();
  }

  if (requestResizeOnMount && typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      if (!app.isDisposed && typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
    });
  }

  return { app, cleanup };
}

/** Dispose an App created by createMob3App. Idempotent. */
export function destroyMob3App(handle: Mob3AppHandle | null | undefined): void {
  if (!handle) return;
  const { app } = handle;
  const cleanup = handle.cleanup;
  handle.cleanup = undefined;
  try {
    cleanup?.();
  } finally {
    if (!app.isDisposed) {
      app.dispose();
    }
  }
}
