/**
 * Export Mob Arena FixedUpdate execution graph as JSON (Phase 4 inspector).
 * Run: npm run inspect -w @mob3/example-mob-arena
 */
import {
  App,
  FixedUpdate,
  formatExecutionPlan,
  planToJson,
} from "@mob3/core";
import { SyntheticInputPlugin } from "@mob3/input";
import { initRapier, RapierPlugin } from "@mob3/rapier";
import { MobArenaPlugin } from "./systems.js";

await initRapier();

const app = new App()
  .addPlugin(SyntheticInputPlugin())
  .addPlugin(RapierPlugin({ gravity: { x: 0, y: 0, z: 0 } }))
  .addPlugin(MobArenaPlugin({ seed: 7 }))
  .enableDiagnostics({ timings: true });

for (let i = 0; i < 30; i++) app.update(1 / 60);

const plan = app.inspectSchedule(FixedUpdate);
console.log(formatExecutionPlan(plan));
console.log("\n--- JSON ---\n");
console.log(JSON.stringify(planToJson(plan), null, 2));

app.dispose();
