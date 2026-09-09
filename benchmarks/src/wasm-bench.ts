/**
 * Phase 8 WASM vs JS ABI backends.
 * Run: npm run bench:wasm
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import {
  App,
  FixedUpdate,
  World,
  packedComponent,
  f32,
  component,
  wasmSystem,
  warmWasmSystem,
  getWasmMeta,
  InProcessAbiExecutor,
  buildSystemInvocation,
  AbiIdRegistry,
  normalizeAccess,
  sharedWasmMemoryAvailable,
  WasmMemoryArena,
  Time,
} from "mob3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmUrl = pathToFileURL(
  path.resolve(__dirname, "../../packages/core/tests/fixtures/wasm/integrate.wasm"),
).href;
const f32Fallback = await import(
  pathToFileURL(
    path.resolve(
      __dirname,
      "../../packages/core/tests/fixtures/abi_integrate_f32.mjs",
    ),
  ).href
);

const EXPECTS = [
  {
    name: "Transform",
    fields: [
      { name: "x", type: "f32" },
      { name: "y", type: "f32" },
      { name: "z", type: "f32" },
    ],
  },
  {
    name: "Velocity",
    fields: [
      { name: "x", type: "f32" },
      { name: "y", type: "f32" },
      { name: "z", type: "f32" },
    ],
  },
];

function now() {
  return performance.now();
}

if (!sharedWasmMemoryAvailable()) {
  console.log("Shared WASM memory unavailable — skip");
  process.exit(0);
}

console.log("=== Phase 8 WASM bench ===\n");
console.log("columns: entities backend coldMs warmMs/tick\n");

const ObjT = component({ x: 0, y: 0, z: 0 }, "ObjT");
const ObjV = component({ x: 0, y: 0, z: 0 }, "ObjV");

async function benchObject(n: number, ticks: number) {
  const app = new App();
  app.setFixedDelta(1 / 60);
  app.addSystem(FixedUpdate, (world) => {
    const dt = world.resource(Time).delta;
    for (const [, t, v] of world.query(ObjT, ObjV)) {
      t.x += v.x * dt;
      t.y += v.y * dt;
      t.z += v.z * dt;
    }
  });
  for (let i = 0; i < n; i++) app.world.spawn(ObjT({ x: i }), ObjV({ x: 1 }));
  for (let i = 0; i < 2; i++) app.update(1 / 60);
  const t0 = now();
  for (let i = 0; i < ticks; i++) app.update(1 / 60);
  const ms = (now() - t0) / ticks;
  app.dispose();
  return ms;
}

async function benchWasm(n: number, ticks: number) {
  const pages = Math.ceil((n * 4 * 3 * 2 + 65536) / 65536) + 16;
  const Transform = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Transform", shared: true, capacity: n + 10, backing: "wasm" },
  );
  const Velocity = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: n + 10, backing: "wasm" },
  );
  const app = new App({
    wasmArena: { initialPages: pages, maxPages: pages + 128 },
  });
  app.setFixedDelta(1 / 60);
  const sys = wasmSystem({
    name: "integrate",
    module: wasmUrl,
    access: { read: [Velocity], write: [Transform] },
    expects: EXPECTS,
    mode: "required",
  });
  app.addSystem(FixedUpdate, sys);
  for (let i = 0; i < n; i++) {
    app.world.spawn(Transform({ x: i * 0.001 }), Velocity({ x: 1, y: 0.5, z: 0 }));
  }
  const cold0 = now();
  await warmWasmSystem(app.world, getWasmMeta(sys)!);
  const coldMs = now() - cold0;
  for (let i = 0; i < 2; i++) app.update(1 / 60);
  const t0 = now();
  for (let i = 0; i < ticks; i++) app.update(1 / 60);
  const warm = (now() - t0) / ticks;
  app.dispose();
  return { coldMs, warm };
}

async function benchInProcess(n: number, ticks: number) {
  const pages = Math.ceil((n * 4 * 3 * 2 + 65536) / 65536) + 16;
  const Transform = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Transform", shared: true, capacity: n + 10, backing: "wasm" },
  );
  const Velocity = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: n + 10, backing: "wasm" },
  );
  const world = new World();
  world.setWasmArena(
    new WasmMemoryArena({
      initialPages: pages,
      maxPages: pages + 128,
    }),
  );
  world.insertResource(Time, {
    delta: 1 / 60,
    elapsed: 0,
    fixedDelta: 1 / 60,
    fixedAccumulator: 0,
    rawDelta: 1 / 60,
  });
  const ids = new AbiIdRegistry();
  const access = normalizeAccess(
    { read: [Velocity], write: [Transform] },
    false,
  );
  const exec = new InProcessAbiExecutor({
    resolve: () => f32Fallback.integrateJs,
  });
  for (let i = 0; i < n; i++) {
    world.spawn(Transform({ x: i * 0.001 }), Velocity({ x: 1, y: 0.5, z: 0 }));
  }
  for (let i = 0; i < 2; i++) {
    await exec.execute(
      buildSystemInvocation({
        world,
        systemName: "integrate",
        access,
        tick: i,
        delta: 1 / 60,
        scheduleName: "b",
        preferShared: true,
        ids,
      }),
    );
  }
  const t0 = now();
  for (let i = 0; i < ticks; i++) {
    await exec.execute(
      buildSystemInvocation({
        world,
        systemName: "integrate",
        access,
        tick: i,
        delta: 1 / 60,
        scheduleName: "b",
        preferShared: true,
        ids,
      }),
    );
  }
  const warm = (now() - t0) / ticks;
  exec.dispose();
  return warm;
}

for (const n of [1_000, 10_000, 50_000, 100_000, 250_000]) {
  const ticks = n >= 100_000 ? 12 : 25;
  const obj = await benchObject(n, ticks);
  const ip = await benchInProcess(n, ticks);
  const wasm = await benchWasm(n, ticks);
  console.log(
    `${n}\tobject\t-\t${obj.toFixed(3)}`,
  );
  console.log(
    `${n}\tabi-inprocess\t-\t${ip.toFixed(3)}`,
  );
  console.log(
    `${n}\twasm-main\t${wasm.coldMs.toFixed(2)}\t${wasm.warm.toFixed(3)}`,
  );
  console.log(
    `  ratios vs object: inprocess=${(obj / ip).toFixed(2)}×  wasm=${(obj / wasm.warm).toFixed(2)}×   wasm vs inprocess=${(ip / wasm.warm).toFixed(2)}×\n`,
  );
}

console.log(
  "Note: cheap Transform+=Velocity*dt — crossover is environment-specific.",
);
