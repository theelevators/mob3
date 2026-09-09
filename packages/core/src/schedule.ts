import type { World } from "./world.js";
import { Commands } from "./commands.js";

/**
 * A system is behavior operating against world state.
 * Structural mutations should go through `commands` and apply after the system returns.
 */
export type SystemFn = (world: World, commands: Commands) => void;

export type ScheduleLabel = string | symbol;

export type SystemConstraints = {
  /** This system must run before these systems (same schedule label). */
  before?: SystemFn | SystemFn[];
  /** This system must run after these systems (same schedule label). */
  after?: SystemFn | SystemFn[];
};

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

type SystemEntry = {
  system: SystemFn;
  before: SystemFn[];
  after: SystemFn[];
};

function asArray(v?: SystemFn | SystemFn[]): SystemFn[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Kahn topological sort; registration order breaks ties. */
function orderSystems(entries: SystemEntry[]): SystemFn[] {
  const nodes = entries.map((e) => e.system);
  const index = new Map<SystemFn, number>();
  nodes.forEach((s, i) => index.set(s, i));

  const succ = new Map<SystemFn, Set<SystemFn>>();
  const indeg = new Map<SystemFn, number>();
  for (const s of nodes) {
    succ.set(s, new Set());
    indeg.set(s, 0);
  }

  const addEdge = (from: SystemFn, to: SystemFn) => {
    if (!index.has(from) || !index.has(to) || from === to) return;
    const set = succ.get(from)!;
    if (set.has(to)) return;
    set.add(to);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
  };

  for (const e of entries) {
    for (const b of e.before) addEdge(e.system, b); // system → before target
    for (const a of e.after) addEdge(a, e.system); // after source → system
  }

  const ready: SystemFn[] = [];
  for (const s of nodes) {
    if ((indeg.get(s) ?? 0) === 0) ready.push(s);
  }
  // stable: keep registration order among ready
  ready.sort((a, b) => index.get(a)! - index.get(b)!);

  const out: SystemFn[] = [];
  while (ready.length) {
    const s = ready.shift()!;
    out.push(s);
    const nexts = [...(succ.get(s) ?? [])].sort(
      (a, b) => index.get(a)! - index.get(b)!,
    );
    for (const n of nexts) {
      const d = (indeg.get(n) ?? 1) - 1;
      indeg.set(n, d);
      if (d === 0) {
        ready.push(n);
        ready.sort((a, b) => index.get(a)! - index.get(b)!);
      }
    }
  }

  if (out.length !== nodes.length) {
    throw new Error(
      "Schedule cycle detected in before/after constraints",
    );
  }
  return out;
}

export class Schedule {
  private readonly entries = new Map<ScheduleLabel, SystemEntry[]>();
  private readonly ordered = new Map<ScheduleLabel, SystemFn[]>();
  private dirty = new Set<ScheduleLabel>();

  addSystem(
    label: ScheduleLabel,
    system: SystemFn,
    constraints?: SystemConstraints,
  ): this {
    let list = this.entries.get(label);
    if (!list) {
      list = [];
      this.entries.set(label, list);
    }
    const existing = list.find((e) => e.system === system);
    if (existing) {
      existing.before.push(...asArray(constraints?.before));
      existing.after.push(...asArray(constraints?.after));
    } else {
      list.push({
        system,
        before: asArray(constraints?.before),
        after: asArray(constraints?.after),
      });
    }
    this.dirty.add(label);
    return this;
  }

  /** Add ordering constraints to an already-registered system. */
  order(
    label: ScheduleLabel,
    system: SystemFn,
    constraints: SystemConstraints,
  ): this {
    return this.addSystem(label, system, constraints);
  }

  run(label: ScheduleLabel, world: World): void {
    const systems = this.resolve(label);
    if (systems.length === 0) return;
    const commands = new Commands(world);
    for (const system of systems) {
      system(world, commands);
      commands.flush();
    }
  }

  systems(label: ScheduleLabel): readonly SystemFn[] {
    return this.resolve(label);
  }

  inspect(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [label] of this.entries) {
      const name =
        typeof label === "symbol" ? label.description ?? String(label) : label;
      out[name] = this.resolve(label).length;
    }
    return out;
  }

  private resolve(label: ScheduleLabel): SystemFn[] {
    if (!this.dirty.has(label) && this.ordered.has(label)) {
      return this.ordered.get(label)!;
    }
    const list = this.entries.get(label) ?? [];
    const ordered = orderSystems(list);
    this.ordered.set(label, ordered);
    this.dirty.delete(label);
    return ordered;
  }
}
