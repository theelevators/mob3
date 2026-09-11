/**
 * Headless Mob Arena — SyntheticInput + Rapier + gameplay. No Three.
 */
import { App } from "@mob3/core";
import { SyntheticInputPlugin, setInputMap } from "@mob3/input";
import { initRapier, RapierPlugin } from "@mob3/rapier";
import { MobArenaPlugin, snapshotOf } from "./game.js";

const TICKS = Number(process.env.MOB_ARENA_TICKS ?? 10_000);
const SEED = Number(process.env.MOB_ARENA_SEED ?? 42);

await initRapier();

const app = new App()
  .addPlugin(SyntheticInputPlugin())
  .addPlugin(RapierPlugin({ gravity: { x: 0, y: 0, z: 0 } }))
  .addPlugin(MobArenaPlugin({ seed: SEED }));

for (let i = 0; i < TICKS; i++) {
  const phase = (i % 240) / 240;
  setInputMap(app.world, {
    KeyW: phase < 0.25,
    KeyD: phase >= 0.25 && phase < 0.5,
    KeyS: phase >= 0.5 && phase < 0.75,
    KeyA: phase >= 0.75,
    Space: i % 15 === 0,
  });
  // Space edge: only true on the tick we set it; clear others false already
  app.update(1 / 60);
}

console.log(
  JSON.stringify({ mode: "headless", ...snapshotOf(app, SEED) }, null, 2),
);

app.dispose();
