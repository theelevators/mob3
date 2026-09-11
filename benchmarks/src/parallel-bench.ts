/**
 * Phase 5 parallel efficiency matrix (copy-based workers).
 * Run: npm run bench:parallel
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import {
  App,
  FixedUpdate,
  component,
  resource,
  workerSystem,
} from "@mob3/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handlersUrl = pathToFileURL(
  path.resolve(__dirname, "../../packages/core/tests/fixtures/handlers.mjs"),
).href;
const handlers = await import(handlersUrl);

// Local independent handlers (inlined module file)
const indepUrl = pathToFileURL(
  path.resolve(__dirname, "parallel-indep-handlers.mjs"),
).href;
const indep = await import(indepUrl);

const Position = component({ x: 0, y: 0, z: 0 }, "Position");
const Velocity = component({ x: 0, y: 0, z: 0 }, "Velocity");
const Heat = component({ v: 0 }, "Heat");
const Wobble = component({ v: 0 }, "Wobble");
const TimeRes = resource<{ delta: number }>("Time");
const SimConfig = resource<{ work: number }>("SimConfig");

function now() {
  return performance.now();
}

async function measureMs(
  app: App,
  ticks: number,
  parallel: boolean,
): Promise<number> {
  for (let i = 0; i < 3; i++) {
    if (parallel) await app.updateAsync(1 / 60);
    else app.update(1 / 60);
  }
  const t0 = now();
  for (let i = 0; i < ticks; i++) {
    if (parallel) await app.updateAsync(1 / 60);
    else app.update(1 / 60);
  }
  return (now() - t0) / ticks;
}

console.log("=== Phase 5 parallel efficiency matrix ===\n");

// --- Cost floor ---
{
  const app = new App({ parallel: { workers: 2 } });
  const damp = workerSystem({
    name: "scaleVelocity",
    module: handlersUrl,
    export: "scaleVelocity",
    run: handlers.scaleVelocity,
    access: { write: [Velocity] },
  });
  app.addSystem(FixedUpdate, damp);
  for (let i = 0; i < 1000; i++) app.world.spawn(Velocity({ x: 1, y: 0, z: 0 }));
  const ms = await measureMs(app, 40, true);
  console.log(
    `cost floor (1k ents, trivial damp, 2 workers): ${ms.toFixed(3)} ms/tick (workers=${app.parallelExecutor?.usingWorkers})\n`,
  );
  app.dispose();
}

// --- Conflicting pair (serialize) — overhead study ---
console.log("--- Conflicting integrate+damp (expect little/no speedup) ---\n");
for (const n of [1_000, 10_000, 50_000]) {
  const build = (parallel: boolean, workers: number) => {
    const integrate = workerSystem({
      name: "heavyIntegrate",
      module: handlersUrl,
      export: "heavyIntegrate",
      run: handlers.heavyIntegrate,
      access: {
        read: [Velocity],
        write: [Position],
        resources: { read: [TimeRes] },
      },
    });
    const damp = workerSystem({
      name: "scaleVelocity",
      module: handlersUrl,
      export: "scaleVelocity",
      run: handlers.scaleVelocity,
      access: { write: [Velocity] },
    });
    const app = parallel
      ? new App({ parallel: { workers } })
      : new App();
    app.insertResource(TimeRes, { delta: 1 / 60 });
    app.setFixedDelta(1 / 60);
    app.addSystem(FixedUpdate, integrate);
    app.addSystem(FixedUpdate, damp);
    for (let i = 0; i < n; i++) {
      app.world.spawn(
        Position({ x: i * 0.001, y: 0, z: 0 }),
        Velocity({ x: 1, y: 0.5, z: 0.25 }),
      );
    }
    return app;
  };
  const seqApp = build(false, 1);
  const seq = await measureMs(seqApp, 20, false);
  seqApp.dispose();
  console.log(`${n} ents  sequential ${seq.toFixed(3)} ms`);
  for (const w of [1, 2, 4]) {
    const parApp = build(true, w);
    const par = await measureMs(parApp, 20, true);
    console.log(
      `  parallel x${w}: ${par.toFixed(3)} ms  S=${(seq / par).toFixed(2)}  E=${(seq / par / w).toFixed(2)}`,
    );
    parApp.dispose();
  }
  console.log("");
}

// --- Independent triple (heat, wobble, orbit-like) ---
console.log("--- Independent heat+wobble+force (expect speedup when work ≫ copy) ---\n");
for (const n of [1_000, 10_000, 50_000, 100_000]) {
  for (const work of [40, 200, 800]) {
    const build = (parallel: boolean, workers: number) => {
      const force = workerSystem({
        name: "force",
        module: indepUrl,
        export: "force",
        run: indep.force,
        access: {
          read: [Position],
          write: [Velocity],
          resources: { read: [SimConfig] },
        },
      });
      const heat = workerSystem({
        name: "heat",
        module: indepUrl,
        export: "heat",
        run: indep.heat,
        access: {
          read: [Position],
          write: [Heat],
          resources: { read: [SimConfig] },
        },
      });
      const wobble = workerSystem({
        name: "wobble",
        module: indepUrl,
        export: "wobble",
        run: indep.wobble,
        access: {
          read: [Position],
          write: [Wobble],
          resources: { read: [SimConfig] },
        },
      });
      const app = parallel
        ? new App({ parallel: { workers } })
        : new App();
      app.insertResource(SimConfig, { work });
      app.setFixedDelta(1 / 60);
      app.addSystem(FixedUpdate, force);
      app.addSystem(FixedUpdate, heat);
      app.addSystem(FixedUpdate, wobble);
      for (let i = 0; i < n; i++) {
        app.world.spawn(
          Position({ x: i * 0.0001, y: 0, z: 0 }),
          Velocity(),
          Heat(),
          Wobble(),
        );
      }
      return app;
    };

    const seqApp = build(false, 1);
    const plan = seqApp.inspectSchedule(FixedUpdate);
    const seq = await measureMs(seqApp, 15, false);
    seqApp.dispose();

    if (n === 1_000 && work === 40) {
      console.log(
        `batches: ${plan.batches.map((b) => b.length).join("|")} (expect one batch of 3)\n`,
      );
    }

    console.log(`${n} ents work=${work}  sequential ${seq.toFixed(3)} ms`);
    for (const w of [2, 4]) {
      const parApp = build(true, w);
      const par = await measureMs(parApp, 15, true);
      const S = seq / par;
      console.log(
        `  parallel x${w}: ${par.toFixed(3)} ms  S=${S.toFixed(2)}  E=${(S / w).toFixed(2)}  ${S > 1.05 ? "WIN" : "no-win"}`,
      );
      parApp.dispose();
    }
  }
  console.log("");
}
