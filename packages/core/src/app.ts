import { World } from "./world.js";
import {
  Schedule,
  Startup,
  PreUpdate,
  FixedUpdate,
  Update,
  PostUpdate,
  PreRender,
  Render,
  PostRender,
  type ScheduleLabel,
  type SystemFn,
} from "./schedule.js";
import type { Plugin, PluginFactory } from "./plugin.js";
import { Time, createTime, MAX_DELTA, type TimeData } from "./time.js";
import type { ResourceKey } from "./resource.js";

export type AppRunner = (app: App) => void;

function browserRunner(app: App): void {
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    app.update(dt);
    app._rafId = requestAnimationFrame(frame);
  };
  app._rafId = requestAnimationFrame(frame);
}

/**
 * Ergonomic composition layer over World + Scheduler.
 *
 * Headless:
 * ```ts
 * const app = new App();
 * app.update(1 / 60);
 * ```
 */
export class App {
  readonly world: World = new World();
  readonly schedule: Schedule = new Schedule();

  private runner: AppRunner = browserRunner;
  private started = false;
  private plugins: Plugin[] = [];
  /** @internal */
  _rafId: number | null = null;

  constructor() {
    this.world.insertResource(Time, createTime());
  }

  addPlugin(plugin: PluginFactory): this {
    const normalized: Plugin =
      typeof plugin === "function" ? { build: plugin } : plugin;
    this.plugins.push(normalized);
    normalized.build(this);
    return this;
  }

  addSystem(label: ScheduleLabel, system: SystemFn): this {
    this.schedule.addSystem(label, system);
    return this;
  }

  insertResource<T>(key: ResourceKey<T>, value: T): this {
    this.world.insertResource(key, value);
    return this;
  }

  setRunner(runner: AppRunner): this {
    this.runner = runner;
    return this;
  }

  setFixedDelta(seconds: number): this {
    const time = this.world.resource(Time);
    time.fixedDelta = seconds;
    return this;
  }

  /**
   * Advance the app by `deltaSeconds`.
   * Safe for tests and headless simulation.
   */
  update(deltaSeconds: number): void {
    this.ensureStartup();

    const time = this.world.resource(Time);
    this.advanceTime(time, deltaSeconds);

    this.schedule.run(PreUpdate, this.world);

    time.fixedAccumulator += time.delta;
    // Spiral-of-death guard: at most a few fixed steps per frame.
    let steps = 0;
    const maxSteps = 5;
    while (time.fixedAccumulator >= time.fixedDelta && steps < maxSteps) {
      this.schedule.run(FixedUpdate, this.world);
      time.fixedAccumulator -= time.fixedDelta;
      steps++;
    }
    if (steps === maxSteps) {
      time.fixedAccumulator = 0;
    }

    this.schedule.run(Update, this.world);
    this.schedule.run(PostUpdate, this.world);
    this.schedule.run(PreRender, this.world);
    this.schedule.run(Render, this.world);
    this.schedule.run(PostRender, this.world);

    // Events survive one update boundary, then clear.
    this.world.clearEvents();
  }

  /** Start the configured runner (browser rAF by default). */
  run(): this {
    this.ensureStartup();
    this.runner(this);
    return this;
  }

  stop(): void {
    if (this._rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private ensureStartup(): void {
    if (this.started) return;
    this.started = true;
    this.schedule.run(Startup, this.world);
  }

  private advanceTime(time: TimeData, deltaSeconds: number): void {
    time.rawDelta = deltaSeconds;
    time.delta = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA);
    time.elapsed += time.delta;
  }
}

export {
  Startup,
  PreUpdate,
  FixedUpdate,
  Update,
  PostUpdate,
  PreRender,
  Render,
  PostRender,
};
