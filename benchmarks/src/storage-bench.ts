/**
 * Phase 6 storage + parallel matrix.
 * Run: npm run bench:storage
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import {
  App,
  World,
  FixedUpdate,
  component,
  packedComponent,
  f32,
  resource,
  workerSystem,
  sharedArrayBufferAvailable,
  tag,
} from "@mob3/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedHandlersUrl = pathToFileURL(
  path.resolve(
    __dirname,
    "../../packages/core/tests/fixtures/shared_handlers.mjs",
  ),
).href;
const sharedHandlers = await import(sharedHandlersUrl);

function now() {
  return performance.now();
}

function bench(label: string, fn: () => void, iters = 5) {
  fn();
  const t0 = now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (now() - t0) / iters;
  console.log(`${label}: ${ms.toFixed(3)} ms`);
  return ms;
}

const ObjPos = component({ x: 0, y: 0, z: 0 }, "ObjPos");
const ObjVel = component({ x: 0, y: 0, z: 0 }, "ObjVel");
const PackPos = packedComponent({ x: f32, y: f32, z: f32 }, { name: "PackPos" });
const PackVel = packedComponent({ x: f32, y: f32, z: f32 }, { name: "PackVel" });
const Health = component({ value: 100 }, "Health");
const Enemy = tag("Enemy");

console.log("=== Phase 6 storage baseline ===\n");
console.log(`SharedArrayBuffer available: ${sharedArrayBufferAvailable()}\n`);

// --- Main-thread Object vs Packed ---
for (const n of [1_000, 10_000, 50_000, 100_000]) {
  console.log(`--- ${n} entities (main thread) ---`);

  bench(`object spawn ${n}`, () => {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn(ObjPos({ x: i }), ObjVel({ x: 1 }));
  }, 3);

  bench(`packed spawn ${n}`, () => {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn(PackPos({ x: i }), PackVel({ x: 1 }));
  }, 3);

  {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn(ObjPos({ x: i }), ObjVel({ x: 1 }));
    bench(`object mutate query ${n}`, () => {
      for (const [, p, v] of w.query(ObjPos, ObjVel)) {
        p.x += v.x * 0.016;
      }
    }, 10);
  }

  {
    const w = new World();
    for (let i = 0; i < n; i++) w.spawn(PackPos({ x: i }), PackVel({ x: 1 }));
    bench(`packed mutate query ${n}`, () => {
      for (const [, p, v] of w.query(PackPos, PackVel)) {
        p.x += v.x * 0.016;
      }
    }, 10);
  }

  if (n <= 50_000) {
    const w = new World();
    for (let i = 0; i < n; i++) {
      w.spawn(PackPos({ x: i }), PackVel(), Health({ value: i }), Enemy);
    }
    bench(`mixed packed+object+tag query ${n}`, () => {
      for (const [, p, h] of w.query(PackPos, Health).with(Enemy)) {
        p.x += 0.001;
        h.value -= 0.001;
      }
    }, 10);
  }

  if (n === 100_000) {
    // rough payload estimate
    const objBytes = n * (3 + 3) * 8; // naive number fields
    const packBytes = n * (3 + 3) * 4; // f32
    console.log(
      `  memory estimate (payload only): object~${(objBytes / 1e6).toFixed(1)}MB vs packed f32~${(packBytes / 1e6).toFixed(1)}MB (+ maps/views overhead unlabeled)`,
    );
  }
  console.log("");
}

// Churn
{
  console.log("--- churn packed 100k / 50% ---");
  const w = new World();
  let ids: number[] = [];
  const t0 = now();
  for (let round = 0; round < 20; round++) {
    while (ids.length < 100_000) {
      ids.push(w.spawn(PackPos({ x: ids.length }), PackVel()));
    }
    const keep: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      if (i & 1) keep.push(ids[i]!);
      else w.despawn(ids[i]!);
    }
    ids = keep;
    for (let i = 0; i < 50_000; i++) {
      ids.push(w.spawn(PackPos(), PackVel()));
    }
  }
  console.log(
    `20 rounds: ${(now() - t0).toFixed(0)} ms  live=${w.entityCount()} store~${w.componentStoreSize(PackPos)}\n`,
  );
}

// Parallel matrix: object-copy vs shared
if (sharedArrayBufferAvailable()) {
  console.log("=== Parallel: copy (object/packed extract) vs shared SAB ===\n");

  const SharedPos = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Position", shared: true, capacity: 120_000 },
  );
  const SharedVel = packedComponent(
    { x: f32, y: f32, z: f32 },
    { name: "Velocity", shared: true, capacity: 120_000 },
  );
  const SharedHeat = packedComponent(
    { v: f32 },
    { name: "Heat", shared: true, capacity: 120_000 },
  );
  const SharedWob = packedComponent(
    { v: f32 },
    { name: "Wobble", shared: true, capacity: 120_000 },
  );
  const SimConfig = resource<{ work: number }>("SimConfig");

  // Copy path uses ordinary packed (non-shared) + Phase 5 extract
  const CopyPos = packedComponent({ x: f32, y: f32, z: f32 }, { name: "Position" });
  const CopyVel = packedComponent({ x: f32, y: f32, z: f32 }, { name: "Velocity" });
  const CopyHeat = packedComponent({ v: f32 }, { name: "Heat" });
  const CopyWob = packedComponent({ v: f32 }, { name: "Wobble" });

  async function measure(
    kind: "seq-obj" | "seq-pack" | "par-copy" | "par-shared",
    n: number,
    work: number,
    workers: number,
  ) {
    const ticks = n >= 50_000 ? 8 : 15;

    if (kind === "seq-obj") {
      const app = new App();
      app.setFixedDelta(1 / 60);
      app.addSystem(FixedUpdate, (world) => {
        for (const [, p, v] of world.query(ObjPos, ObjVel)) {
          let burn = 0;
          for (let k = 0; k < work; k++) burn += Math.sin(p.x + k);
          p.x += v.x * 0.016 + burn * 1e-16;
        }
      });
      for (let i = 0; i < n; i++) app.world.spawn(ObjPos({ x: i * 0.001 }), ObjVel({ x: 1 }));
      for (let i = 0; i < 2; i++) app.update(1 / 60);
      const t0 = now();
      for (let i = 0; i < ticks; i++) app.update(1 / 60);
      const ms = (now() - t0) / ticks;
      app.dispose();
      return ms;
    }

    if (kind === "seq-pack") {
      const app = new App();
      app.setFixedDelta(1 / 60);
      app.addSystem(FixedUpdate, (world) => {
        for (const [, p, v] of world.query(PackPos, PackVel)) {
          let burn = 0;
          for (let k = 0; k < work; k++) burn += Math.sin(p.x + k);
          p.x += v.x * 0.016 + burn * 1e-16;
        }
      });
      for (let i = 0; i < n; i++) app.world.spawn(PackPos({ x: i * 0.001 }), PackVel({ x: 1 }));
      for (let i = 0; i < 2; i++) app.update(1 / 60);
      const t0 = now();
      for (let i = 0; i < ticks; i++) app.update(1 / 60);
      const ms = (now() - t0) / ticks;
      app.dispose();
      return ms;
    }

    const shared = kind === "par-shared";
    const Pos = shared ? SharedPos : CopyPos;
    const Vel = shared ? SharedVel : CopyVel;
    const Heat = shared ? SharedHeat : CopyHeat;
    const Wob = shared ? SharedWob : CopyWob;

    const force = workerSystem({
      name: "force",
      module: sharedHandlersUrl,
      export: "force",
      run: sharedHandlers.force,
      access: {
        read: [Pos],
        write: [Vel],
        resources: { read: [SimConfig] },
      },
    });
    const heat = workerSystem({
      name: "heat",
      module: sharedHandlersUrl,
      export: "heat",
      run: sharedHandlers.heat,
      access: {
        read: [Pos],
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
        read: [Pos],
        write: [Wob],
        resources: { read: [SimConfig] },
      },
    });

    const app = new App({
      parallel: {
        workers,
        dataPath: shared ? "shared" : "copy",
      },
    });
    app.insertResource(SimConfig, { work });
    app.setFixedDelta(1 / 60);
    app.addSystem(FixedUpdate, force);
    app.addSystem(FixedUpdate, heat);
    app.addSystem(FixedUpdate, wobble);
    for (let i = 0; i < n; i++) {
      app.world.spawn(Pos({ x: i * 0.0001 }), Vel(), Heat(), Wob());
    }
    for (let i = 0; i < 2; i++) await app.updateAsync(1 / 60);
    app.parallelExecutor?.clearTimings();
    const t0 = now();
    for (let i = 0; i < ticks; i++) await app.updateAsync(1 / 60);
    const ms = (now() - t0) / ticks;
    const bt = app.parallelExecutor?.lastBatchTimings() ?? [];
    const avgTransfer =
      bt.reduce((s, t) => s + t.transferMs, 0) / Math.max(1, bt.length);
    const avgCommit =
      bt.reduce((s, t) => s + t.commitMs, 0) / Math.max(1, bt.length);
    app.dispose();
    return { ms, avgTransfer, avgCommit, path: bt[0]?.path };
  }

  for (const n of [1_000, 10_000, 50_000, 100_000]) {
    for (const work of [40, 200, 800]) {
      console.log(`\n${n} ents work=${work}`);
      const seqObj = await measure("seq-obj", n, work, 1);
      const seqPack = await measure("seq-pack", n, work, 1);
      console.log(`  seq object:  ${seqObj.toFixed(3)} ms`);
      console.log(
        `  seq packed:  ${seqPack.toFixed(3)} ms  (vs obj ${(seqObj / seqPack).toFixed(2)}×)`,
      );

      const copy = (await measure("par-copy", n, work, 2)) as {
        ms: number;
        avgTransfer: number;
        avgCommit: number;
        path?: string;
      };
      console.log(
        `  par copy x2: ${copy.ms.toFixed(3)} ms  xfer=${copy.avgTransfer.toFixed(2)} commit=${copy.avgCommit.toFixed(2)} S_vs_seqPack=${(seqPack / copy.ms).toFixed(2)}`,
      );

      const shared = (await measure("par-shared", n, work, 2)) as {
        ms: number;
        avgTransfer: number;
        avgCommit: number;
        path?: string;
      };
      console.log(
        `  par shared x2: ${shared.ms.toFixed(3)} ms  xfer=${shared.avgTransfer.toFixed(2)} commit=${shared.avgCommit.toFixed(2)} path=${shared.path} S_vs_seqPack=${(seqPack / shared.ms).toFixed(2)} S_vs_copy=${(copy.ms / shared.ms).toFixed(2)}`,
      );
    }
  }
} else {
  console.log("Skipping shared parallel matrix (SharedArrayBuffer unavailable)");
}
