/**
 * Mixed-component ECS benchmarks — population ≠ rendered objects.
 */
import {
  World,
  App,
  Update,
  FixedUpdate,
  Transform,
  component,
  tag,
  Time,
} from "mob3";

const Velocity = component({ x: 1, y: 0, z: 0 });
const Health = component({ value: 100 });
const Lifetime = component({ remaining: 1 });
const Enemy = tag("Enemy");
const Renderable = tag("Renderable"); // stand-in for ThreeObject population

function bench(name: string, fn: () => void, iterations = 5): number {
  fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  console.log(`${name.padEnd(42)} ${median.toFixed(2)} ms`);
  return median;
}

function buildMixedWorld() {
  const world = new World();
  // 100k Transform
  // 80k Velocity
  // 40k Health
  // 20k Enemy
  // 10k Lifetime
  // 1k Renderable
  for (let i = 0; i < 100_000; i++) {
    const bundle = [Transform({ x: i * 0.001, y: 0, z: 0 })];
    if (i < 80_000) bundle.push(Velocity({ x: 1 }));
    if (i < 40_000) bundle.push(Health({ value: 100 }));
    if (i < 20_000) bundle.push(Enemy);
    if (i < 10_000) bundle.push(Lifetime({ remaining: 5 }));
    if (i < 1_000) bundle.push(Renderable);
    world.spawn(...bundle);
  }
  return world;
}

console.log("mob3 mixed-component benchmarks (median of 5)\n");
console.log("Population: 100k Transform / 80k Vel / 40k Health / 20k Enemy / 10k Lifetime / 1k Renderable\n");

bench("spawn mixed 100k", () => {
  buildMixedWorld();
});

{
  const world = buildMixedWorld();
  bench("query(Transform) 100k", () => {
    let n = 0;
    for (const _ of world.query(Transform)) n++;
    if (n !== 100_000) throw new Error(`expected 100k got ${n}`);
  });

  bench("query(Transform, Velocity) 80k", () => {
    let n = 0;
    for (const _ of world.query(Transform, Velocity)) n++;
    if (n !== 80_000) throw new Error(`expected 80k got ${n}`);
  });

  bench("query(Transform, Velocity).with(Enemy)", () => {
    let n = 0;
    for (const _ of world.query(Transform, Velocity).with(Enemy)) n++;
    if (n !== 20_000) throw new Error(`expected 20k got ${n}`);
  });

  bench("query Renderable only (1k)", () => {
    let n = 0;
    for (const _ of world.query(Transform).with(Renderable)) n++;
    if (n !== 1_000) throw new Error(`expected 1k got ${n}`);
  });

  bench("add/remove Health on 10k", () => {
    const Extra = component({ v: 1 });
    let i = 0;
    for (const [e] of world.query(Transform)) {
      if (i++ >= 10_000) break;
      world.add(e, Extra());
    }
    i = 0;
    for (const [e] of world.query(Extra)) {
      world.remove(e, Extra);
      if (++i >= 10_000) break;
    }
  });

  const lifetimeWorld = buildMixedWorld();
  const lifeIds: number[] = [];
  for (const [e] of lifetimeWorld.query(Lifetime)) lifeIds.push(e);
  bench(
    "despawn 10k Lifetime entities",
    () => {
      // one-shot: world is spent after first run
      for (const e of lifeIds) lifetimeWorld.despawn(e);
    },
    1,
  );
}

bench("one sim tick (movement+ai-ish) on mixed world", () => {
  const app = new App().setFixedDelta(1 / 60);
  const world = app.world;
  for (let i = 0; i < 100_000; i++) {
    const bundle = [Transform({ x: i * 0.001 }), Velocity({ x: 1 })];
    if (i < 20_000) bundle.push(Enemy);
    if (i < 1_000) bundle.push(Renderable);
    world.spawn(...bundle);
  }

  app.addSystem(FixedUpdate, (w) => {
    const { delta } = w.resource(Time);
    for (const [, t, v] of w.query(Transform, Velocity)) {
      t.x += v.x * delta;
    }
  });
  app.addSystem(FixedUpdate, (w) => {
    // "AI" over enemies only
    for (const [, t] of w.query(Transform).with(Enemy)) {
      t.z += 0.001;
    }
  });
  app.addSystem(Update, (w) => {
    // "render sync" over 1k only
    let n = 0;
    for (const _ of w.query(Transform).with(Renderable)) n++;
    void n;
  });

  app.update(1 / 60);
});

console.log("\nNote: Renderable (1k) << Transform (100k) — ECS population ≠ draw calls.");
