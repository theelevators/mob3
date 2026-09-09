/**
 * Planner / scheduler micro-benchmarks for Phase 4.
 * Run: npx tsx src/planner-bench.ts
 */
import {
  App,
  Update,
  component,
  system,
  type SystemFn,
} from "mob3";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function makeComponents(n: number) {
  return Array.from({ length: n }, (_, i) => component({ i }));
}

function bench(label: string, fn: () => void, iters = 50) {
  fn(); // warm
  const t0 = now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (now() - t0) / iters;
  console.log(`${label}: ${ms.toFixed(3)} ms/op (${iters} iters)`);
  return ms;
}

function trivialSystems(count: number): SystemFn[] {
  const comps = makeComponents(Math.min(count, 64));
  const systems: SystemFn[] = [];
  for (let i = 0; i < count; i++) {
    const c = comps[i % comps.length]!;
    const mode = i % 4;
    if (mode === 0) {
      systems.push(
        system({
          name: `read_${i}`,
          access: { read: [c] },
          run() {},
        }),
      );
    } else if (mode === 1) {
      systems.push(
        system({
          name: `write_indep_${i}`,
          access: { write: [comps[i % comps.length]!] },
          run() {},
        }),
      );
    } else if (mode === 2) {
      systems.push(
        system({
          name: `res_read_${i}`,
          access: { read: [c] },
          run() {},
        }),
      );
    } else {
      // conflicting writers on comps[0]
      systems.push(
        system({
          name: `conflict_write_${i}`,
          access: { write: [comps[0]!] },
          run() {},
        }),
      );
    }
  }
  return systems;
}

function buildApp(systems: SystemFn[]) {
  const app = new App();
  for (const s of systems) app.addSystem(Update, s);
  return app;
}

console.log("=== Phase 4 planner / scheduler bench ===\n");

for (const n of [10, 100, 1000]) {
  const systems = trivialSystems(n);
  console.log(`--- ${n} systems ---`);
  bench(`register ${n}`, () => {
    buildApp(systems);
  }, n >= 1000 ? 10 : 50);

  const compileApp = buildApp(systems);
  bench(`compile plan ${n}`, () => {
    const a = buildApp(systems);
    a.inspectSchedule(Update);
  }, n >= 1000 ? 10 : 50);

  const warm = buildApp(systems);
  warm.inspectSchedule(Update);
  bench(`reuse plan ${n}`, () => {
    warm.inspectSchedule(Update);
  });

  const runApp = buildApp(systems);
  runApp.inspectSchedule(Update);
  bench(`run Update ${n} (instr off)`, () => {
    runApp.update(1 / 60);
  }, n >= 1000 ? 20 : 100);

  const timed = buildApp(systems);
  timed.enableDiagnostics({ timings: true });
  timed.inspectSchedule(Update);
  bench(`run Update ${n} (instr on)`, () => {
    timed.update(1 / 60);
  }, n >= 1000 ? 20 : 100);

  const plan = compileApp.inspectSchedule(Update);
  console.log(
    `  conflicts=${plan.conflicts.length} batches=${plan.batches.length} diagnostics=${plan.diagnostics.length}`,
  );
  console.log("");
}

// Known pattern: 100 systems → expected batch structure sanity
{
  const comps = makeComponents(50);
  const shared = comps[0]!;
  const systems: SystemFn[] = [];
  for (let i = 0; i < 25; i++) {
    systems.push(
      system({ name: `rA_${i}`, access: { read: [shared] }, run() {} }),
    );
  }
  for (let i = 0; i < 25; i++) {
    systems.push(
      system({
        name: `wIndep_${i}`,
        access: { write: [comps[i + 1]!] },
        run() {},
      }),
    );
  }
  for (let i = 0; i < 25; i++) {
    systems.push(
      system({ name: `rIndep_${i}`, access: { read: [comps[i + 1]!] }, run() {} }),
    );
  }
  for (let i = 0; i < 25; i++) {
    systems.push(
      system({ name: `wShared_${i}`, access: { write: [shared] }, run() {} }),
    );
  }
  const app = buildApp(systems);
  const plan = app.inspectSchedule(Update);
  const readersInBatch0 = plan.batches[0]!.filter((id) => {
    const s = plan.systems.find((x) => x.id === id)!;
    return s.name.startsWith("rA_");
  }).length;
  console.log("=== synthetic 100-system pattern ===");
  console.log(
    `batches=${plan.batches.length} batch0_shared_readers≈${readersInBatch0} (expect 25)`,
  );
  console.log(
    `shared writers each alone: ${
      plan.batches.filter((b) =>
        b.some((id) =>
          plan.systems.find((s) => s.id === id)?.name.startsWith("wShared_"),
        ),
      ).length
    } batches touch wShared_*`,
  );
}
