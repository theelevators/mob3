import type { App } from "./app.js";

/**
 * A plugin configures an App. Keep it boring.
 *
 * Plugins should prefer public App APIs so third-party plugins stay first-class.
 */
export interface Plugin {
  build(app: App): void;
}

export type PluginFactory = Plugin | ((app: App) => void);
