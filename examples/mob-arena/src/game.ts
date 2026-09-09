/**
 * Mob Arena composition helpers.
 */
import { App, type Entity } from "mob3";
import {
  Transform,
  Player,
  Enemy,
  Projectile,
  Health,
  Score,
  GameMeta,
} from "./components.js";
import { MobArenaPlugin, type MobArenaOptions } from "./systems.js";

export type { MobArenaOptions };
export { MobArenaPlugin } from "./systems.js";

export type GameSnapshot = {
  seed: number;
  tick: number;
  kills: number;
  deaths: number;
  entities: number;
  gameOver: boolean;
  playerHealth: number;
  playerX: number;
  playerZ: number;
  enemyCount: number;
  projectileCount: number;
};

export type ArenaApp = {
  app: App;
  world: App["world"];
  update(dt: number): void;
  snapshot(seed?: number): GameSnapshot;
  player(): Entity;
};

export function snapshotOf(app: App, seed = 0): GameSnapshot {
  const world = app.world;
  const meta = world.resource(GameMeta);
  const score = world.resource(Score);
  const playerT = world.get(meta.player, Transform);
  const playerH = world.get(meta.player, Health);
  let enemyCount = 0;
  let projectileCount = 0;
  for (const _ of world.query(Enemy)) enemyCount++;
  for (const _ of world.query(Projectile)) projectileCount++;
  return {
    seed,
    tick: meta.tick,
    kills: score.kills,
    deaths: score.deaths,
    entities: world.entityCount(),
    gameOver: meta.gameOver,
    playerHealth: playerH?.value ?? 0,
    playerX: playerT?.x ?? 0,
    playerZ: playerT?.z ?? 0,
    enemyCount,
    projectileCount,
  };
}
