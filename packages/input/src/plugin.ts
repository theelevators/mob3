import {
  PostRender,
  system,
  type App,
  type Plugin,
} from "@mob3/core";
import { Input, createInputState, type KeyCode } from "./state.js";

export type InputPluginOptions = {
  /** Target for listeners. Default: window when available. */
  target?: EventTarget;
  /** Prevent default on these codes. */
  preventDefault?: KeyCode[];
};

/**
 * DOM → Input resource. Does nothing in non-DOM environments
 * beyond inserting the Input resource (use SyntheticInputPlugin / applyInput).
 */
export function InputPlugin(options: InputPluginOptions = {}): Plugin {
  let detach: (() => void) | null = null;

  return {
    build(app: App) {
      if (!app.world.hasResource(Input)) {
        app.insertResource(Input, createInputState());
      }

      app.addSystem(PostRender, clearInputTransients);

      const target =
        options.target ??
        (typeof window !== "undefined" ? window : undefined);
      if (!target) return;

      const input = app.world.resource(Input);
      const prevent = new Set(options.preventDefault ?? ["Space"]);

      const onDown = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.repeat) return;
        input.setPressed(ke.code, true);
        if (prevent.has(ke.code)) ke.preventDefault();
      };
      const onUp = (e: Event) => {
        const ke = e as KeyboardEvent;
        input.setPressed(ke.code, false);
      };

      target.addEventListener("keydown", onDown);
      target.addEventListener("keyup", onUp);
      detach = () => {
        target.removeEventListener("keydown", onDown);
        target.removeEventListener("keyup", onUp);
        detach = null;
      };
      app.onDispose(() => detach?.());
    },
    dispose() {
      detach?.();
    },
  };
}

/**
 * Ensures Input exists; no DOM. Drive with `applyInput` / `setInputMap`.
 */
export function SyntheticInputPlugin(): Plugin {
  return {
    build(app: App) {
      if (!app.world.hasResource(Input)) {
        app.insertResource(Input, createInputState());
      }
      app.addSystem(PostRender, clearInputTransients);
    },
  };
}

export const clearInputTransients = system({
  name: "clearInputTransients",
  access: {
    resources: { write: [Input] },
  },
  run(world) {
    world.resource(Input).clearTransients();
  },
});
