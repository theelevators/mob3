import type { App, PluginFactory } from "@mob3/core";
import type { ThreePluginOptions } from "@mob3/three";

export type Mob3AppSetup = (app: App) => void | (() => void);

export type UseMob3AppOptions = {
  /**
   * When an object (or `true`), attach ThreePlugin to the given canvas.
   * Pass `false` to skip Three (headless / custom renderer).
   */
  three?: boolean | ThreePluginOptions;
  /** Extra plugins after ThreePlugin (if any). */
  plugins?: PluginFactory[];
  /**
   * Called once per App instance after plugins are added, before `run()`.
   * May return a cleanup invoked before `app.dispose()`.
   */
  setup?: Mob3AppSetup;
  /** Start the default rAF runner. Default true. */
  run?: boolean;
  /** Fire a resize after mount so 0×0 canvases recover. Default true. */
  requestResizeOnMount?: boolean;
};

export type Mob3AppHandle = {
  app: App;
  /** Optional setup cleanup — cleared after first destroy. */
  cleanup?: () => void;
};
