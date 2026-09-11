import { useEffect, useRef, useState, type RefObject } from "react";
import type { App } from "@mob3/core";
import { createMob3App, destroyMob3App } from "./createMob3App.js";
import type { Mob3AppHandle, UseMob3AppOptions } from "./types.js";

export type UseMob3AppResult = {
  /** Live App after mount; null during SSR / before effect. */
  app: App | null;
  /** Attach to a `<canvas>` (ignored if `canvasRef` option is passed). */
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

export type UseMob3AppHookOptions = UseMob3AppOptions & {
  /**
   * External canvas ref. When omitted, the hook creates one for you.
   */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
};

/**
 * Strict Mode–safe mob3 App lifecycle.
 *
 * - Creates the App in `useEffect` (client only)
 * - Disposes on unmount / before remount (Strict Mode)
 * - Optionally wires ThreePlugin to the canvas
 * - Dispatches a resize after mount for 0×0 layout recovery
 */
export function useMob3App(
  options: UseMob3AppHookOptions = {},
): UseMob3AppResult {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = options.canvasRef ?? internalRef;
  const handleRef = useRef<Mob3AppHandle | null>(null);
  const [app, setApp] = useState<App | null>(null);

  // Keep latest options without re-creating the App every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    const {
      canvasRef: _ignored,
      ...createOpts
    } = optionsRef.current;

    // Strict Mode: dispose any leftover from the previous invoke.
    destroyMob3App(handleRef.current);
    handleRef.current = null;

    let handle: Mob3AppHandle;
    try {
      handle = createMob3App(canvas, createOpts);
    } catch (err) {
      setApp(null);
      throw err;
    }

    handleRef.current = handle;
    setApp(handle.app);

    return () => {
      if (handleRef.current === handle) {
        destroyMob3App(handle);
        handleRef.current = null;
      } else {
        destroyMob3App(handle);
      }
      setApp(null);
    };
    // Recreate when the canvas element identity changes.
  }, [canvasRef]);

  return { app, canvasRef };
}
