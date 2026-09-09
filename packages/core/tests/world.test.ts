import { describe, expect, it } from "vitest";
import {
  World,
  component,
  tag,
  resource,
  event,
  App,
  Update,
  Startup,
  FixedUpdate,
  Time,
} from "../src/index.js";

const Position = component({ x: 0, y: 0, z: 0 });
const Velocity = component({ x: 0, y: 0, z: 0 });
const Health = component({ value: 100 });
const Player = tag("Player");
const Disabled = tag("Disabled");

describe("World entity/component ops", () => {
  it("spawns with components and tags", () => {
    const world = new World();
    const e = world.spawn(
      Position({ x: 1, y: 2, z: 3 }),
      Velocity({ x: 4 }),
      Player,
    );

    expect(world.isAlive(e)).toBe(true);
    expect(world.get(e, Position)).toEqual({ x: 1, y: 2, z: 3 });
    expect(world.get(e, Velocity)).toEqual({ x: 4, y: 0, z: 0 });
    expect(world.has(e, Player)).toBe(true);
  });

  it("add/remove/has/get work", () => {
    const world = new World();
    const e = world.spawn(Position());
    world.add(e, Health({ value: 50 }));
    expect(world.get(e, Health)?.value).toBe(50);
    expect(world.remove(e, Health)).toBe(true);
    expect(world.has(e, Health)).toBe(false);
  });

  it("despawn removes components and recycles ids", () => {
    const world = new World();
    const a = world.spawn(Position());
    world.despawn(a);
    expect(world.isAlive(a)).toBe(false);
    const b = world.spawn(Position());
    expect(b).toBe(a);
  });
});

describe("Queries", () => {
  it("iterates matching entities with inference-friendly tuples", () => {
    const world = new World();
    world.spawn(Position({ x: 1 }), Velocity({ x: 2 }), Player);
    world.spawn(Position({ x: 9 })); // no velocity

    const rows = world.query(Position, Velocity).collect();
    expect(rows).toHaveLength(1);
    const [entity, position, velocity] = rows[0]!;
    expect(typeof entity).toBe("number");
    expect(position.x).toBe(1);
    expect(velocity.x).toBe(2);
  });

  it("supports with/without filters", () => {
    const world = new World();
    world.spawn(Position(), Velocity(), Player);
    world.spawn(Position(), Velocity(), Disabled);
    world.spawn(Position(), Velocity(), Player, Disabled);

    const activePlayers = world
      .query(Position, Velocity)
      .with(Player)
      .without(Disabled)
      .collect();

    expect(activePlayers).toHaveLength(1);
  });

  it("mutates component data in place during iteration", () => {
    const world = new World();
    const e = world.spawn(Position({ x: 0 }), Velocity({ x: 5 }));
    for (const [, position, velocity] of world.query(Position, Velocity)) {
      position.x += velocity.x;
    }
    expect(world.get(e, Position)?.x).toBe(5);
  });
});

describe("Resources", () => {
  it("inserts and reads resources", () => {
    const world = new World();
    const Score = resource<{ value: number }>("Score");
    world.insertResource(Score, { value: 10 });
    expect(world.resource(Score).value).toBe(10);
    world.removeResource(Score);
    expect(world.hasResource(Score)).toBe(false);
  });

  it("supports class constructors as keys", () => {
    class Input {
      forward = false;
    }
    const world = new World();
    world.insertResource(Input, new Input());
    expect(world.resource(Input)).toBeInstanceOf(Input);
  });
});

describe("Events", () => {
  it("delivers typed events within an update then clears", () => {
    const Collision = event<{ a: number; b: number }>("Collision");
    const seen: Array<{ a: number; b: number }> = [];
    let shouldSend = true;

    const app = new App()
      .addSystem(Update, (world) => {
        if (shouldSend) world.send(Collision, { a: 1, b: 2 });
      })
      .addSystem(Update, (world) => {
        for (const c of world.events(Collision)) seen.push(c);
      });

    app.update(1 / 60);
    expect(seen).toEqual([{ a: 1, b: 2 }]);

    shouldSend = false;
    seen.length = 0;
    app.update(1 / 60);
    expect(seen).toEqual([]);
  });
});

describe("App + scheduler", () => {
  it("runs Startup once and Update each frame", () => {
    const log: string[] = [];
    const app = new App()
      .addSystem(Startup, () => log.push("startup"))
      .addSystem(Update, () => log.push("update"));

    app.update(1 / 60);
    app.update(1 / 60);
    expect(log).toEqual(["startup", "update", "update"]);
  });

  it("runs FixedUpdate based on accumulator", () => {
    let fixed = 0;
    const app = new App()
      .setFixedDelta(0.05)
      .addSystem(FixedUpdate, () => {
        fixed++;
      });

    app.update(0.12);
    expect(fixed).toBe(2);
  });

  it("exposes Time resource", () => {
    const app = new App();
    app.update(0.016);
    const time = app.world.resource(Time);
    expect(time.delta).toBeCloseTo(0.016, 3);
    expect(time.elapsed).toBeCloseTo(0.016, 3);
  });

  it("builds plugins via public API", () => {
    const Flag = resource<{ ok: boolean }>("Flag");
    let built = false;
    const app = new App().addPlugin({
      build(a) {
        built = true;
        a.insertResource(Flag, { ok: true });
      },
    });
    expect(built).toBe(true);
    expect(app.world.resource(Flag).ok).toBe(true);
  });
});

describe("Plugins composition", () => {
  it("composes multiple plugins", () => {
    const A = resource<{ n: number }>("A");
    const B = resource<{ n: number }>("B");
    const app = new App()
      .addPlugin({
        build(a) {
          a.insertResource(A, { n: 1 });
        },
      })
      .addPlugin({
        build(a) {
          a.insertResource(B, { n: 2 });
        },
      });
    expect(app.world.resource(A).n).toBe(1);
    expect(app.world.resource(B).n).toBe(2);
  });
});
