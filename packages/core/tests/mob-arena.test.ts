import { describe, expect, it } from "vitest";
import { createGame } from "../../../examples/mob-arena/src/game.ts";
import { Input, Enemy, Transform } from "../../../examples/mob-arena/src/components.ts";

function runScripted(seed: number, ticks: number) {
  const game = createGame({ seed });
  for (let i = 0; i < ticks; i++) {
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
  return game.snapshot();
}

describe("Mob Arena headless", () => {
  it("runs without three / @mob3/three", () => {
    const game = createGame({ seed: 1 });
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    const snap = game.snapshot();
    expect(snap.tick).toBe(120);
    expect(snap.entities).toBeGreaterThan(0);
  });

  it("produces identical snapshots for the same seed and input", () => {
    const a = runScripted(42, 10_000);
    const b = runScripted(42, 10_000);
    expect(a).toEqual(b);
  });

  it("diverges for different seeds", () => {
    const a = runScripted(1, 2000);
    const b = runScripted(2, 2000);
    // Enemy spawn positions differ → likely different state
    expect(
      a.playerX !== b.playerX ||
        a.kills !== b.kills ||
        a.enemyCount !== b.enemyCount ||
        a.playerHealth !== b.playerHealth,
    ).toBe(true);
  });

  it("keeps simulation entities without requiring ThreeObject", () => {
    const game = createGame({ seed: 3 });
    for (let i = 0; i < 300; i++) game.update(1 / 60);
    let enemies = 0;
    for (const [e] of game.world.query(Transform).with(Enemy)) {
      enemies++;
      // No ThreeObject in headless world — component type isn't even registered
      expect(game.world.components(e).length).toBeGreaterThan(0);
    }
    expect(enemies).toBeGreaterThan(0);
  });
});
