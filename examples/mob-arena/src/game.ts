/**
 * Create a Mob Arena game world — simulation only, no renderer.
 */
import { App, FixedUpdate, Update, type Entity } from "mob3";
import {
  Transform,
  Velocity,
  Player,
  Enemy,
  Projectile,
  Health,
  Collider,
  Score,
  SpawnConfig,
  Input,
  Random,
  GameMeta,
  createRng,
  createDefaultSpawnConfig,
  createDefaultInput,
} from "./components.js";
import { addGameplaySystems, despawnPending } from "./systems.js";

export type CreateGameOptions = {
  seed?: number;
  fixedDelta?: number;
  /**
   * Register `despawnPending` automatically (default true).
   * Browser sets false so it can detach Three meshes first, then register despawn itself.
   */
  autoDespawn?: boolean;
};

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

export type Game = {
  app: App;
  world: App["world"];
  update(dt: number): void;
  player(): Entity;
  snapshot(): GameSnapshot;
};

export function createGame(options: CreateGameOptions = {}): Game {
  const seed = options.seed ?? 42;
  const autoDespawn = options.autoDespawn ?? true;
  const app = new App().setFixedDelta(options.fixedDelta ?? 1 / 60);

  app.insertResource(Score, { kills: 0, deaths: 0 });
  app.insertResource(SpawnConfig, createDefaultSpawnConfig());
  app.insertResource(Input, createDefaultInput());
  app.insertResource(Random, createRng(seed));

  const player = app.world.spawn(
    Transform({ x: 0, y: 0.5, z: 0 }),
    Velocity(),
    Player,
    Health({ value: 100 }),
    Collider({ radius: 0.5 }),
  );

  app.insertResource(GameMeta, {
    player,
    tick: 0,
    gameOver: false,
  });

  addGameplaySystems(app);
  if (autoDespawn) {
    app.addSystem(FixedUpdate, despawnPending);
    app.addSystem(Update, despawnPending);
  }

  return {
    app,
    world: app.world,
    update(dt: number) {
      app.update(dt);
    },
    player() {
      return app.world.resource(GameMeta).player;
    },
    snapshot(): GameSnapshot {
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
    },
  };
}
