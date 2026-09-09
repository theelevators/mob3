/**
 * Mob Arena gameplay systems — ECS only.
 * Uses @mob3/input Input resource and @mob3/rapier CollisionStarted.
 */
import {
  type World,
  type Commands,
  type App,
  type Plugin,
  Time,
  FixedUpdate,
  Update,
  Startup,
  PendingDespawn,
  Transform,
  system,
} from "mob3";
import { Input } from "@mob3/input";
import {
  RigidBody,
  PhysicsCollider,
  CollisionStarted,
  writeKinematicTransforms,
  emitCollisionEvents,
  cleanupPhysicsBodies,
  PhysicsWorld,
} from "@mob3/rapier";
import {
  Velocity,
  Player,
  Enemy,
  Projectile,
  Dead,
  Health,
  Damage,
  Lifetime,
  Score,
  SpawnConfig,
  Random,
  GameMeta,
  DamageEvent,
  DeathEvent,
  createDefaultSpawnConfig,
  createRng,
} from "./components.js";

function countEnemies(world: World): number {
  let n = 0;
  for (const _ of world.query(Enemy).without(Dead)) n++;
  return n;
}

function ballCollider(radius: number) {
  return PhysicsCollider({
    shape: "ball",
    radius,
    hx: radius,
    hy: radius,
    hz: radius,
    sensor: false,
    membership: 0xffff,
    filter: 0xffff,
  });
}

function kinematicBody() {
  return RigidBody({ kind: "kinematicPosition", lx: 0, ly: 0, lz: 0 });
}

export const playerMovement = system({
  name: "playerMovement",
  access: {
    read: [Player, Dead],
    write: [Transform, Velocity],
    resources: { read: [Input, SpawnConfig, Time] },
  },
  run(world) {
    const input = world.resource(Input);
    const config = world.resource(SpawnConfig);
    const { delta } = world.resource(Time);

    for (const [, transform, velocity] of world
      .query(Transform, Velocity)
      .with(Player)
      .without(Dead)) {
      let x = 0;
      let z = 0;
      if (input.pressed("KeyW") || input.pressed("ArrowUp")) z -= 1;
      if (input.pressed("KeyS") || input.pressed("ArrowDown")) z += 1;
      if (input.pressed("KeyA") || input.pressed("ArrowLeft")) x -= 1;
      if (input.pressed("KeyD") || input.pressed("ArrowRight")) x += 1;
      const len = Math.hypot(x, z);
      if (len > 0) {
        x /= len;
        z /= len;
      }
      velocity.x = x * config.playerSpeed;
      velocity.z = z * config.playerSpeed;
      transform.x += velocity.x * delta;
      transform.z += velocity.z * delta;

      const r = config.arenaRadius;
      transform.x = Math.max(-r, Math.min(r, transform.x));
      transform.z = Math.max(-r, Math.min(r, transform.z));
    }
  },
});

export const enemySpawn = system({
  name: "enemySpawn",
  access: {
    read: [Enemy, Dead],
    resources: {
      read: [GameMeta, Time, Random],
      write: [SpawnConfig],
    },
    commands: true,
  },
  run(world, commands) {
    const config = world.resource(SpawnConfig);
    const rng = world.resource(Random);
    const meta = world.resource(GameMeta);
    if (meta.gameOver) return;

    const { delta } = world.resource(Time);
    config.timer -= delta;
    if (config.timer > 0) return;

    if (countEnemies(world) >= config.maxEnemies) {
      config.timer = config.interval * 0.25;
      return;
    }

    config.timer = config.interval;
    const angle = rng.next() * Math.PI * 2;
    const dist = config.arenaRadius * (0.75 + rng.next() * 0.25);

    commands.spawn(
      Transform({
        x: Math.cos(angle) * dist,
        y: 0.4,
        z: Math.sin(angle) * dist,
      }),
      Velocity(),
      Enemy,
      Health({ value: config.enemyHealth }),
      Damage({ value: 8 }),
      kinematicBody(),
      ballCollider(0.45),
    );
  },
});

export const enemyAi = system({
  name: "enemyAi",
  access: {
    read: [Transform, Enemy, Dead],
    write: [Velocity],
    resources: { read: [SpawnConfig, GameMeta] },
  },
  run(world) {
    const config = world.resource(SpawnConfig);
    const meta = world.resource(GameMeta);
    if (!world.isAlive(meta.player)) return;
    const playerTransform = world.get(meta.player, Transform);
    if (!playerTransform) return;

    for (const [, transform, velocity] of world
      .query(Transform, Velocity)
      .with(Enemy)
      .without(Dead)) {
      const dx = playerTransform.x - transform.x;
      const dz = playerTransform.z - transform.z;
      const len = Math.hypot(dx, dz) || 1;
      velocity.x = (dx / len) * config.enemySpeed;
      velocity.z = (dz / len) * config.enemySpeed;
    }
  },
});

export const movement = system({
  name: "movement",
  access: {
    read: [Player],
    write: [Transform, Velocity],
    resources: { read: [Time] },
  },
  run(world) {
    const { delta } = world.resource(Time);
    for (const [, transform, velocity] of world
      .query(Transform, Velocity)
      .without(Player)) {
      transform.x += velocity.x * delta;
      transform.y += velocity.y * delta;
      transform.z += velocity.z * delta;
    }
  },
});

export const projectileSpawn = system({
  name: "projectileSpawn",
  access: {
    read: [Transform, Velocity, Dead, Player],
    resources: { read: [Input, SpawnConfig, GameMeta] },
    commands: true,
  },
  run(world, commands) {
    const input = world.resource(Input);
    const config = world.resource(SpawnConfig);
    const meta = world.resource(GameMeta);
    if (meta.gameOver) return;
    if (!input.justPressed("Space")) return;
    if (!world.isAlive(meta.player) || world.has(meta.player, Dead)) return;

    const playerT = world.get(meta.player, Transform);
    const playerV = world.get(meta.player, Velocity);
    if (!playerT) return;

    let ax = playerV?.x ?? 0;
    let az = playerV?.z ?? 0;
    if (Math.hypot(ax, az) < 0.01) {
      ax = 0;
      az = -1;
    } else {
      const len = Math.hypot(ax, az);
      ax /= len;
      az /= len;
    }

    const speed = config.projectileSpeed;
    commands.spawn(
      Transform({
        x: playerT.x + ax * 0.7,
        y: 0.5,
        z: playerT.z + az * 0.7,
        sx: 0.35,
        sy: 0.35,
        sz: 0.35,
      }),
      Velocity({ x: ax * speed, z: az * speed }),
      Projectile,
      Damage({ value: config.projectileDamage }),
      Lifetime({ remaining: config.projectileLifetime }),
      kinematicBody(),
      ballCollider(0.25),
    );
  },
});

export const lifetimeSystem = system({
  name: "lifetimeSystem",
  access: {
    read: [PendingDespawn],
    write: [Lifetime],
    resources: { read: [Time] },
    commands: true,
  },
  run(world, commands) {
    const { delta } = world.resource(Time);
    for (const [entity, lifetime] of world
      .query(Lifetime)
      .without(PendingDespawn)) {
      lifetime.remaining -= delta;
      if (lifetime.remaining <= 0) {
        commands.add(entity, PendingDespawn);
      }
    }
  },
});

/** Translate Rapier collision events into DamageEvent. */
export const collisionDamage = system({
  name: "collisionDamage",
  access: {
    read: [Projectile, Enemy, Player, Damage],
    resources: { read: [Time] },
    events: { read: [CollisionStarted], write: [DamageEvent] },
    commands: true,
  },
  run(world, commands) {
    const { delta } = world.resource(Time);

    for (const hit of world.events(CollisionStarted)) {
      const { a, b } = hit;
      pairDamage(world, commands, a, b, delta);
      pairDamage(world, commands, b, a, delta);
    }
  },
});

function pairDamage(
  world: World,
  commands: Commands,
  source: number,
  target: number,
  delta: number,
): void {
  if (!world.isAlive(source) || !world.isAlive(target)) return;

  if (world.has(source, Projectile) && world.has(target, Enemy)) {
    const dmg = world.get(source, Damage)?.value ?? 10;
    world.send(DamageEvent, { target, amount: dmg, source });
    commands.add(source, PendingDespawn);
  }

  if (world.has(source, Enemy) && world.has(target, Player)) {
    const dmg = world.get(source, Damage)?.value ?? 8;
    world.send(DamageEvent, {
      target,
      amount: dmg * delta,
      source,
    });
  }
}

export const applyDamage = system({
  name: "applyDamage",
  access: {
    read: [Dead, PendingDespawn],
    write: [Health],
    events: { read: [DamageEvent] },
  },
  run(world) {
    for (const evt of world.events(DamageEvent)) {
      if (!world.isAlive(evt.target)) continue;
      if (world.has(evt.target, Dead) || world.has(evt.target, PendingDespawn)) {
        continue;
      }
      const health = world.get(evt.target, Health);
      if (!health) continue;
      health.value -= evt.amount;
    }
  },
});

export const deathSystem = system({
  name: "deathSystem",
  access: {
    read: [Health, Dead, Enemy, Player],
    resources: { write: [Score, GameMeta] },
    events: { write: [DeathEvent] },
    commands: true,
  },
  run(world, commands) {
    for (const [entity, health] of world.query(Health).without(Dead)) {
      if (health.value > 0) continue;
      const wasEnemy = world.has(entity, Enemy);
      const wasPlayer = world.has(entity, Player);
      world.send(DeathEvent, { entity, wasEnemy, wasPlayer });
      commands.add(entity, Dead);
      if (wasEnemy) {
        world.resource(Score).kills += 1;
        commands.add(entity, PendingDespawn);
      }
      if (wasPlayer) {
        world.resource(Score).deaths += 1;
        world.resource(GameMeta).gameOver = true;
      }
    }
  },
});

export const despawnPending = system({
  name: "despawnPending",
  access: {
    read: [PendingDespawn],
    commands: true,
  },
  run(world, commands) {
    for (const [entity] of world.query(PendingDespawn)) {
      commands.despawn(entity);
    }
  },
});

export const tickMeta = system({
  name: "tickMeta",
  access: {
    resources: { write: [GameMeta] },
  },
  run(world) {
    world.resource(GameMeta).tick += 1;
  },
});

/**
 * Restart clears arena state. Uses Commands for despawn tags, but also
 * immediate `world.remove(Dead)` — left declared; see phase-4-findings.
 */
export const restartSystem = system({
  name: "restartSystem",
  access: {
    read: [Enemy, Projectile, Dead],
    write: [Transform, Health, Velocity],
    resources: {
      read: [Input],
      write: [GameMeta, Score, SpawnConfig],
    },
    commands: true,
  },
  run(world, commands) {
    const input = world.resource(Input);
    if (!input.justPressed("KeyR")) return;

    for (const [e] of world.query(Enemy)) commands.add(e, PendingDespawn);
    for (const [e] of world.query(Projectile)) commands.add(e, PendingDespawn);

    const meta = world.resource(GameMeta);
    if (world.isAlive(meta.player)) {
      const t = world.get(meta.player, Transform);
      const h = world.get(meta.player, Health);
      const v = world.get(meta.player, Velocity);
      if (t) {
        t.x = 0;
        t.y = 0.5;
        t.z = 0;
      }
      if (h) h.value = 100;
      if (v) {
        v.x = 0;
        v.y = 0;
        v.z = 0;
      }
      if (world.has(meta.player, Dead)) world.remove(meta.player, Dead);
    }

    const score = world.resource(Score);
    score.kills = 0;
    score.deaths = 0;
    Object.assign(world.resource(SpawnConfig), createDefaultSpawnConfig());
    meta.gameOver = false;
  },
});

export type MobArenaOptions = {
  seed?: number;
  fixedDelta?: number;
};

/**
 * Gameplay plugin. Requires Input + PhysicsWorld by Startup
 * (add Input/Rapier plugins before `app.run()` / first update — order among
 * addPlugin calls does not matter).
 */
export function MobArenaPlugin(options: MobArenaOptions = {}): Plugin {
  const seed = options.seed ?? 42;

  return {
    build(app: App) {
      if (options.fixedDelta) app.setFixedDelta(options.fixedDelta);

      app.insertResource(Score, { kills: 0, deaths: 0 });
      app.insertResource(SpawnConfig, createDefaultSpawnConfig());
      app.insertResource(Random, createRng(seed));

      // Immediate world.spawn — left opaque (not Commands).
      app.addSystem(Startup, function spawnPlayer(world) {
        if (!world.hasResource(Input)) {
          throw new Error(
            "MobArenaPlugin requires Input — add InputPlugin or SyntheticInputPlugin",
          );
        }
        if (!world.hasResource(PhysicsWorld)) {
          throw new Error(
            "MobArenaPlugin requires PhysicsWorld — add RapierPlugin",
          );
        }
        if (world.hasResource(GameMeta)) return;

        const player = world.spawn(
          Transform({ x: 0, y: 0.5, z: 0 }),
          Velocity(),
          Player,
          Health({ value: 100 }),
          kinematicBody(),
          ballCollider(0.5),
        );
        world.insertResource(GameMeta, { player, tick: 0, gameOver: false });
      });

      app.addSystem(FixedUpdate, playerMovement, {
        before: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, enemySpawn, {
        before: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, enemyAi, {
        before: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, projectileSpawn, {
        before: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, movement, {
        before: writeKinematicTransforms,
      });
      app.addSystem(FixedUpdate, lifetimeSystem, {
        before: writeKinematicTransforms,
      });

      app.addSystem(FixedUpdate, collisionDamage, {
        after: emitCollisionEvents,
      });
      app.addSystem(FixedUpdate, applyDamage, {
        after: collisionDamage,
      });
      app.addSystem(FixedUpdate, deathSystem, {
        after: applyDamage,
      });

      app.order(FixedUpdate, cleanupPhysicsBodies, {
        after: deathSystem,
      });

      app.addSystem(FixedUpdate, despawnPending, {
        after: cleanupPhysicsBodies,
      });
      app.addSystem(FixedUpdate, tickMeta);

      app.addSystem(Update, restartSystem);
      app.addSystem(Update, despawnPending, {
        after: restartSystem,
      });
    },
  };
}
