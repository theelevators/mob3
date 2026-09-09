import { describe, expect, it } from "vitest";
import {
  App,
  World,
  Transform,
  GlobalTransform,
  component,
  tag,
  setScale,
  setTranslation,
} from "../src/index.js";

describe("Phase 12 DX", () => {
  it("spawn accepts branded component instances without casts", () => {
    const world = new World();
    const Marker = tag("Marker");
    const Stats = component({ hp: 10 }, "Stats");

    // Compile-time + runtime: no `as never`
    const e = world.spawn(Transform(), Stats({ hp: 3 }), Marker);
    expect(world.get(e, Stats)?.hp).toBe(3);
    expect(world.has(e, Marker)).toBe(true);
  });

  it("get() mutation does not dirty; getMut/setScale/mutate do", () => {
    const app = new App();
    const e = app.world.spawn(Transform({ sx: 1 }), GlobalTransform());
    app.update(1 / 60);

    // Silent field write via get — must NOT mark changed
    app.world.get(e, Transform)!.sx = 4;
    expect(app.world.isChanged(e, Transform)).toBe(false);

    setScale(app.world, e, 2, 3, 4);
    expect(app.world.isChanged(e, Transform)).toBe(true);
    expect(app.world.get(e, Transform)?.sy).toBe(3);

    setTranslation(app.world, e, 1, 2, 3);
    expect(app.world.get(e, Transform)?.x).toBe(1);

    app.world.mutate(e, Transform, (t) => {
      t.rz = 0.5;
    });
    expect(app.world.get(e, Transform)?.rz).toBe(0.5);
  });
});
