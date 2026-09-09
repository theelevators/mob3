/**
 * Headless Mob Arena runner — no three / @mob3/three.
 */
import { createGame } from "./game.js";
import { Input } from "./components.js";

const TICKS = Number(process.env.MOB_ARENA_TICKS ?? 10_000);
const SEED = Number(process.env.MOB_ARENA_SEED ?? 42);

const game = createGame({ seed: SEED });

// Scripted input: move in a circle-ish pattern and fire periodically.
for (let i = 0; i < TICKS; i++) {
  const input = game.world.resource(Input);
  const phase = (i % 240) / 240;
  input.up = phase < 0.25;
  input.right = phase >= 0.25 && phase < 0.5;
  input.down = phase >= 0.5 && phase < 0.75;
  input.left = phase >= 0.75;
  input.fire = i % 15 === 0;
  input.firePressed = i % 15 === 0;
  game.update(1 / 60);
}

const snap = game.snapshot();
console.log(
  JSON.stringify(
    {
      mode: "headless",
      ...snap,
    },
    null,
    2,
  ),
);
