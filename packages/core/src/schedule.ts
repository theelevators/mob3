import type { World } from "./world.js";
import { Commands } from "./commands.js";

/**
 * A system is behavior operating against world state.
 * Structural mutations should go through `commands` and apply after the system returns.
 */
export type SystemFn = (world: World, commands: Commands) => void;

export type ScheduleLabel = string | symbol;

/** Built-in schedule labels. */
export const Startup = Symbol.for("mob3.schedule.Startup");
export const PreUpdate = Symbol.for("mob3.schedule.PreUpdate");
export const FixedUpdate = Symbol.for("mob3.schedule.FixedUpdate");
export const Update = Symbol.for("mob3.schedule.Update");
export const PostUpdate = Symbol.for("mob3.schedule.PostUpdate");
export const PreRender = Symbol.for("mob3.schedule.PreRender");
export const Render = Symbol.for("mob3.schedule.Render");
export const PostRender = Symbol.for("mob3.schedule.PostRender");

export const DEFAULT_SCHEDULE_ORDER: ScheduleLabel[] = [
  PreUpdate,
  FixedUpdate,
  Update,
  PostUpdate,
  PreRender,
  Render,
  PostRender,
];

export class Schedule {
  private readonly systemMap = new Map<ScheduleLabel, SystemFn[]>();

  addSystem(label: ScheduleLabel, system: SystemFn): this {
    let list = this.systemMap.get(label);
    if (!list) {
      list = [];
      this.systemMap.set(label, list);
    }
    list.push(system);
    return this;
  }

  /**
   * Run all systems for a label.
   * After each system: flush commands so later systems see structural changes.
   * Event lifetime is owned by App (not cleared here).
   */
  run(label: ScheduleLabel, world: World): void {
    const list = this.systemMap.get(label);
    if (!list) return;
    const commands = new Commands(world);
    for (const system of list) {
      system(world, commands);
      commands.flush();
    }
  }

  systems(label: ScheduleLabel): readonly SystemFn[] {
    return this.systemMap.get(label) ?? [];
  }

  inspect(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [label, list] of this.systemMap) {
      const name =
        typeof label === "symbol" ? label.description ?? String(label) : label;
      out[name] = list.length;
    }
    return out;
  }
}
