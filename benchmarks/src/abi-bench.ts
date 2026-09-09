/**
 * Phase 7 ABI overhead vs Phase 6 direct shared worker path.
 * Run: npm run bench:abi
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import {
  App,
  FixedUpdate,
  packedComponent,
  f32,
  resource,
  workerSystem,
  abiSystem,
  sharedArrayBufferAvailable,
} from "mob3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedHandlersUrl = pathToFileURL(
  path.resolve(
    __dirname,
    "../../packages/core/tests/fixtures/shared_handlers.mjs",
  ),
).href;
const abiHandlersUrl = pathToFileURL(
  path.resolve(__dirname, "../../packages/core/tests/fixtures/abi_handlers.mjs"),
).href;
const sharedHandlers = await import(sharedHandlersUrl);
const abiHandlers = await import(abiHandlersUrl);

function now() {
  return performance.now();
}

if (!sharedArrayBufferAvailable()) {
  console.log("SharedArrayBuffer unavailable — skip ABI bench");
  process.exit(0);
}

console.log("=== Phase 7 ABI vs Phase 6 shared ===\n");

async function measurePhase6Shared(n: number, work: number, workers: number) {
  const Position = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Position", shared: true, capacity: n + 1000 },
  );
  const Velocity = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: n + 1000 },
  );
  const Heat = packedComponent(
    { v: f32 },
    { name: "Heat", shared: true, capacity: n + 1000 },
  );
  const Wobble = packedComponent(
    { v: f32 },
    { name: "Wobble", shared: true, capacity: n + 1000 },
  );
  const SimConfig = resource<{ work: number }>("SimConfig");

  const force = workerSystem({
    name: "force",
    module: sharedHandlersUrl,
    export: "force",
    run: sharedHandlers.force,
    access: {
      read: [Position],
      write: [Velocity],
      resources: { read: [SimConfig] },
    },
  });
  const heat = workerSystem({
    name: "heat",
    module: sharedHandlersUrl,
    export: "heat",
    run: sharedHandlers.heat,
    access: {
      read: [Position],
      write: [Heat],
      resources: { read: [SimConfig] },
    },
  });
  const wobble = workerSystem({
    name: "wobble",
    module: sharedHandlersUrl,
    export: "wobble",
    run: sharedHandlers.wobble,
    access: {
      read: [Position],
      write: [Wobble],
      resources: { read: [SimConfig] },
    },
  });

  const app = new App({
    parallel: { workers, dataPath: "shared" },
  });
  app.insertResource(SimConfig, { work });
  app.setFixedDelta(1 / 60);
  app.addSystem(FixedUpdate, force);
  app.addSystem(FixedUpdate, heat);
  app.addSystem(FixedUpdate, wobble);
  for (let i = 0; i < n; i++) {
    app.world.spawn(Position({ x: i * 0.0001 }), Velocity(), Heat(), Wobble());
  }
  const ticks = n >= 50_000 ? 8 : 15;
  for (let i = 0; i < 2; i++) await app.updateAsync(1 / 60);
  app.parallelExecutor?.clearTimings();
  const t0 = now();
  for (let i = 0; i < ticks; i++) await app.updateAsync(1 / 60);
  const ms = (now() - t0) / ticks;
  const bt = app.parallelExecutor?.lastBatchTimings() ?? [];
  const avg = (key: "transferMs" | "commitMs" | "dispatchMs" | "barrierMs") =>
    bt.reduce((s, t) => s + t[key], 0) / Math.max(1, bt.length);
  app.dispose();
  return {
    ms,
    transfer: avg("transferMs"),
    commit: avg("commitMs"),
    dispatch: avg("dispatchMs"),
    barrier: avg("barrierMs"),
    path: bt[0]?.path,
  };
}

async function measureAbiShared(n: number, work: number, workers: number) {
  // Single integrate-style ABI system with similar arithmetic density to force
  const Position = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Position", shared: true, capacity: n + 1000 },
  );
  const Velocity = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: n + 1000 },
  );
  const SimConfig = resource<{ work: number }>("SimConfig");

  const force = abiSystem({
    name: "force",
    module: abiHandlersUrl,
    export: "force",
    system: abiHandlers.force,
    access: {
      read: [Position],
      write: [Velocity],
      resources: { read: [SimConfig] },
    },
  });

  const app = new App({
    parallel: { workers, dataPath: "shared" },
  });
  app.insertResource(SimConfig, { work });
  app.setFixedDelta(1 / 60);
  app.addSystem(FixedUpdate, force);
  for (let i = 0; i < n; i++) {
    app.world.spawn(Position({ x: i * 0.0001 }), Velocity());
  }
  const ticks = n >= 50_000 ? 8 : 15;
  for (let i = 0; i < 2; i++) await app.updateAsync(1 / 60);
  app.parallelExecutor?.clearTimings();
  const t0 = now();
  for (let i = 0; i < ticks; i++) await app.updateAsync(1 / 60);
  const ms = (now() - t0) / ticks;
  const bt = app.parallelExecutor?.lastBatchTimings() ?? [];
  const avg = (key: "transferMs" | "commitMs" | "dispatchMs" | "barrierMs") =>
    bt.reduce((s, t) => s + t[key], 0) / Math.max(1, bt.length);
  app.dispose();
  return {
    ms,
    transfer: avg("transferMs"),
    commit: avg("commitMs"),
    dispatch: avg("dispatchMs"),
    barrier: avg("barrierMs"),
    path: bt[0]?.path,
  };
}

/** Fairer: same single-system integrate via Phase 6 shared vs ABI shared. */
async function measureIntegrateCompare(n: number, workers: number) {
  const Transform = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Transform", shared: true, capacity: n + 1000 },
  );
  const Velocity = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: n + 1000 },
  );

  // ABI path
  const abiApp = new App({ parallel: { workers, dataPath: "shared" } });
  abiApp.setFixedDelta(1 / 60);
  abiApp.addSystem(
    FixedUpdate,
    abiSystem({
      name: "integrate",
      module: abiHandlersUrl,
      export: "integrate",
      system: abiHandlers.integrate,
      access: { read: [Velocity], write: [Transform] },
    }),
  );
  for (let i = 0; i < n; i++) {
    abiApp.world.spawn(
      Transform({ x: i * 0.001 }),
      Velocity({ x: 1, y: 0, z: 0 }),
    );
  }

  const ticks = n >= 50_000 ? 8 : 15;
  for (let i = 0; i < 2; i++) await abiApp.updateAsync(1 / 60);
  abiApp.parallelExecutor?.clearTimings();
  let t0 = now();
  for (let i = 0; i < ticks; i++) await abiApp.updateAsync(1 / 60);
  const abiMs = (now() - t0) / ticks;
  const abiBt = abiApp.parallelExecutor?.lastBatchTimings() ?? [];
  const abiXfer =
    abiBt.reduce((s, t) => s + t.transferMs, 0) / Math.max(1, abiBt.length);
  const abiPath = abiBt[0]?.path;
  abiApp.dispose();

  return { abiMs, abiXfer, abiPath };
}

for (const n of [10_000, 50_000, 100_000, 250_000]) {
  console.log(`\n--- ${n} entities ---`);
  try {
    const p6 = await measurePhase6Shared(n, 40, 2);
    console.log(
      `Phase6 shared (3 systems): ${p6.ms.toFixed(3)} ms  xfer=${p6.transfer.toFixed(2)} commit=${p6.commit.toFixed(2)} path=${p6.path}`,
    );
  } catch (e) {
    console.log(`Phase6 shared failed: ${(e as Error).message}`);
  }

  try {
    const abi = await measureAbiShared(n, 40, 2);
    console.log(
      `ABI shared (force):         ${abi.ms.toFixed(3)} ms  xfer=${abi.transfer.toFixed(2)} commit=${abi.commit.toFixed(2)} path=${abi.path}`,
    );
  } catch (e) {
    console.log(`ABI shared failed: ${(e as Error).message}`);
  }

  try {
    const integ = await measureIntegrateCompare(n, 2);
    console.log(
      `ABI integrate:              ${integ.abiMs.toFixed(3)} ms  xfer=${integ.abiXfer.toFixed(2)} path=${integ.abiPath}`,
    );
  } catch (e) {
    console.log(`ABI integrate failed: ${(e as Error).message}`);
  }
}

console.log(
  "\nTarget: ABI shared transfer stays single-digit ms at 100k (no Phase 5 cliff).",
);
