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
  type SystemConstraints,
} from "./schedule.js";
import { normalizePlugin, type Plugin, type PluginFactory } from "./plugin.js";
import { Time, createTime, MAX_DELTA, type TimeData } from "./time.js";
import type { ResourceKey } from "./resource.js";

export type AppRunner = (app: App) => void;

function browserRunner(app: App): void {
  let last = performance.now();
  const frame = (now: number) => {
    if (app.isDisposed) return;
    const dt = (now - last) / 1000;
    last = now;
    app.update(dt);
    if (!app.isDisposed) {
      app._rafId = requestAnimationFrame(frame);
    }
  };
  app._rafId = requestAnimationFrame(frame);
}

/**
 * Ergonomic composition layer over World + Scheduler.
 */
export class App {
  readonly world: World = new World();
  readonly schedule: Schedule = new Schedule();

  private runner: AppRunner = browserRunner;
  private started = false;
  private disposed = false;
  private plugins: Plugin[] = [];
  private disposeHooks: Array<(app: App) => void> = [];
  /** @internal */
  _rafId: number | null = null;

  constructor() {
    this.world.insertResource(Time, createTime());
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  addPlugin(plugin: PluginFactory): this {
    this.assertNotDisposed();
    const normalized = normalizePlugin(plugin);
    this.plugins.push(normalized);
    normalized.build(this);
    return this;
  }

  addSystem(
    label: ScheduleLabel,
    system: SystemFn,
    constraints?: SystemConstraints,
  ): this {
    this.assertNotDisposed();
    this.schedule.addSystem(label, system, constraints);
    return this;
  }

  /** Add before/after constraints for an existing system in a schedule. */
  order(
    label: ScheduleLabel,
    system: SystemFn,
    constraints: SystemConstraints,
  ): this {
    this.assertNotDisposed();
    this.schedule.order(label, system, constraints);
    return this;
  }

  insertResource<T>(key: ResourceKey<T>, value: T): this {
    this.assertNotDisposed();
    this.world.insertResource(key, value);
    return this;
  }

  setRunner(runner: AppRunner): this {
    this.assertNotDisposed();
    this.runner = runner;
    return this;
  }

  setFixedDelta(seconds: number): this {
    this.world.resource(Time).fixedDelta = seconds;
    return this;
  }

  /** Register cleanup invoked once from `dispose()`. */
  onDispose(fn: (app: App) => void): this {
    this.disposeHooks.push(fn);
    return this;
  }

  update(deltaSeconds: number): void {
    this.assertNotDisposed();
    this.ensureStartup();

    const time = this.world.resource(Time);
    this.advanceTime(time, deltaSeconds);

    this.schedule.run(PreUpdate, this.world);

    time.fixedAccumulator += time.delta;
    const frameDelta = time.delta;
    let steps = 0;
    const maxSteps = 5;
    while (time.fixedAccumulator >= time.fixedDelta && steps < maxSteps) {
      this.world.clearEvents();
      time.delta = time.fixedDelta;
      this.schedule.run(FixedUpdate, this.world);
      time.fixedAccumulator -= time.fixedDelta;
      steps++;
    }
    if (steps === maxSteps) {
      time.fixedAccumulator = 0;
    }
    time.delta = frameDelta;

    this.schedule.run(Update, this.world);
    this.schedule.run(PostUpdate, this.world);
    this.schedule.run(PreRender, this.world);
    this.schedule.run(Render, this.world);
    this.schedule.run(PostRender, this.world);

    this.world.clearEvents();
  }

  run(): this {
    this.assertNotDisposed();
    this.ensureStartup();
    this.runner(this);
    return this;
  }

  /** Stop the browser animation loop (does not dispose plugins). */
  stop(): void {
    if (this._rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Stop the runner and dispose all plugins / onDispose hooks.
   * Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      this.plugins[i]!.dispose?.(this);
    }
    for (let i = this.disposeHooks.length - 1; i >= 0; i--) {
      this.disposeHooks[i]!(this);
    }
    this.disposeHooks.length = 0;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("App has been disposed");
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
