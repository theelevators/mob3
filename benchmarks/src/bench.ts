import { World, component, App, Update, Time } from "mob3";

const Position = component({ x: 0, y: 0, z: 0 });
const Velocity = component({ x: 1, y: 0, z: 0 });

function bench(name: string, fn: () => void, iterations = 5): void {
  // warmup
  fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  console.log(`${name.padEnd(36)} ${median.toFixed(2)} ms`);
}

function spawnN(n: number) {
  const world = new World();
  for (let i = 0; i < n; i++) {
    world.spawn(Position({ x: i }), Velocity({ x: 1 }));
  }
  return world;
}

console.log("mob3 benchmarks (median of 5)\n");

for (const n of [1_000, 10_000, 100_000]) {
  bench(`spawn ${n}`, () => {
    spawnN(n);
  });
}

bench("despawn 10k", () => {
  const world = spawnN(10_000);
  for (const e of [...world.entities()]) world.despawn(e);
});

bench("add/remove component 10k", () => {
  const Extra = component({ v: 0 });
  const world = spawnN(10_000);
  for (const e of world.entities()) world.add(e, Extra());
  for (const e of world.entities()) world.remove(e, Extra);
});

bench("query iteration 10k", () => {
  const world = spawnN(10_000);
  let sum = 0;
  for (let i = 0; i < 100; i++) {
    for (const [, p, v] of world.query(Position, Velocity)) {
      sum += p.x + v.x;
    }
  }
  void sum;
});

bench("query iteration 100k", () => {
  const world = spawnN(100_000);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    for (const [, p, v] of world.query(Position, Velocity)) {
      sum += p.x + v.x;
    }
  }
  void sum;
});

bench("system execution 10k × 120 frames", () => {
  const app = new App().addSystem(Update, (world) => {
    const { delta } = world.resource(Time);
    for (const [, p, v] of world.query(Position, Velocity)) {
      p.x += v.x * delta;
    }
  });
  for (let i = 0; i < 10_000; i++) {
    app.world.spawn(Position(), Velocity({ x: 1 }));
  }
  for (let i = 0; i < 120; i++) app.update(1 / 60);
});

console.log("\nDone. Storage is Map-of-Maps; compare after Phase 6 optimizations.");
