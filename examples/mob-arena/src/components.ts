/**
 * Mob Arena gameplay components — no Three / DOM / Rapier imports.
 */
import {
  Transform,
  PendingDespawn,
  component,
  tag,
  resource,
  event,
  type Entity,
} from "@mob3/core";

export { Transform, PendingDespawn };

export const Velocity = component({ x: 0, y: 0, z: 0 }, "Velocity");

export const Player = tag("Player");
export const Enemy = tag("Enemy");
export const Projectile = tag("Projectile");
export const Dead = tag("Dead");

export const Health = component({ value: 100 }, "Health");
export const Damage = component({ value: 10 }, "Damage");
export const Lifetime = component({ remaining: 1 }, "Lifetime");

export const Score = resource<{ kills: number; deaths: number }>("Score");
export const SpawnConfig = resource<{
  interval: number;
  timer: number;
  maxEnemies: number;
  enemySpeed: number;
  enemyHealth: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileLifetime: number;
  playerSpeed: number;
  arenaRadius: number;
}>("SpawnConfig");

export type Rng = {
  next(): number;
  seed: number;
};

export const Random = resource<Rng>("Random");

export const GameMeta = resource<{
  player: Entity;
  tick: number;
  gameOver: boolean;
}>("GameMeta");

export const DamageEvent = event<{
  target: Entity;
  amount: number;
  source: Entity;
}>("DamageEvent");

export const DeathEvent = event<{
  entity: Entity;
  wasEnemy: boolean;
  wasPlayer: boolean;
}>("DeathEvent");

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return {
    seed,
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 1_000_000) / 1_000_000;
    },
  };
}

export function createDefaultSpawnConfig() {
  return {
    interval: 0.85,
    timer: 0,
    maxEnemies: 40,
    enemySpeed: 3.2,
    enemyHealth: 30,
    projectileSpeed: 14,
    projectileDamage: 10,
    projectileLifetime: 1.4,
    playerSpeed: 7,
    arenaRadius: 18,
  };
}
