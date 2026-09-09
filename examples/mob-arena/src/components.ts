/**
 * Mob Arena — shared gameplay components & resources.
 * No Three.js imports.
 */
import {
  Transform,
  component,
  tag,
  resource,
  event,
  type Entity,
} from "mob3";

export { Transform };

export const Velocity = component({ x: 0, y: 0, z: 0 });

export const Player = tag("Player");
export const Enemy = tag("Enemy");
export const Projectile = tag("Projectile");
export const Dead = tag("Dead");
/** Marked for structural removal after optional view cleanup. */
export const PendingDespawn = tag("PendingDespawn");

export const Health = component({ value: 100 });
export const Damage = component({ value: 10 });
export const Lifetime = component({ remaining: 1 });
export const Collider = component({ radius: 0.5 });

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

export const Input = resource<{
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  firePressed: boolean;
  restart: boolean;
  restartPressed: boolean;
}>("Input");

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

export function createDefaultInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    firePressed: false,
    restart: false,
    restartPressed: false,
  };
}
