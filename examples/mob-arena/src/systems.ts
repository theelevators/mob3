/**
 * Mob Arena gameplay systems — pure ECS, no Three.js.
 */
import {
  type World,
  type Commands,
  Time,
  FixedUpdate,
  Update,
  type App,
} from "mob3";
import {
  Transform,
  Velocity,
  Player,
  Enemy,
  Projectile,
  Dead,
  PendingDespawn,
  Health,
  Damage,
  Lifetime,
  Collider,
  Score,
  SpawnConfig,
  Input,
  Random,
  GameMeta,
  DamageEvent,
  DeathEvent,
  createDefaultSpawnConfig,
} from "./components.js";

function countEnemies(world: World): number {
  let n = 0;
  for (const _ of world.query(Enemy).without(Dead)) n++;
  return n;
}

export function playerMovement(world: World): void {
  const input = world.resource(Input);
  const config = world.resource(SpawnConfig);
  const { delta } = world.resource(Time);

  for (const [, transform, velocity] of world
    .query(Transform, Velocity)
    .with(Player)
    .without(Dead)) {
    let x = 0;
    let z = 0;
    if (input.up) z -= 1;
    if (input.down) z += 1;
    if (input.left) x -= 1;
    if (input.right) x += 1;
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
}

export function enemySpawn(world: World, commands: Commands): void {
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
    Collider({ radius: 0.45 }),
  );
}

export function enemyAi(world: World): void {
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
}

export function movement(world: World): void {
  const { delta } = world.resource(Time);
  for (const [, transform, velocity] of world
    .query(Transform, Velocity)
    .without(Player)) {
    transform.x += velocity.x * delta;
    transform.y += velocity.y * delta;
    transform.z += velocity.z * delta;
  }
}

export function projectileSpawn(world: World, commands: Commands): void {
  const input = world.resource(Input);
  const config = world.resource(SpawnConfig);
  const meta = world.resource(GameMeta);
  if (meta.gameOver) return;
  if (!input.firePressed) return;
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
    Collider({ radius: 0.25 }),
  );
}

export function lifetimeSystem(world: World, commands: Commands): void {
  const { delta } = world.resource(Time);
  for (const [entity, lifetime] of world.query(Lifetime).without(PendingDespawn)) {
    lifetime.remaining -= delta;
    if (lifetime.remaining <= 0) {
      commands.add(entity, PendingDespawn);
    }
  }
}

export function collision(world: World, commands: Commands): void {
  const projectiles = world
    .query(Transform, Collider, Damage)
    .with(Projectile)
    .without(Dead)
    .without(PendingDespawn)
    .collect();
  const enemies = world
    .query(Transform, Collider, Health)
    .with(Enemy)
    .without(Dead)
    .without(PendingDespawn)
    .collect();
  const players = world
    .query(Transform, Collider, Health)
    .with(Player)
    .without(Dead)
    .collect();

  for (const [proj, pt, pc, pd] of projectiles) {
    for (const [enemy, et, ec] of enemies) {
      const dx = pt.x - et.x;
      const dz = pt.z - et.z;
      const r = pc.radius + ec.radius;
      if (dx * dx + dz * dz <= r * r) {
        world.send(DamageEvent, {
          target: enemy,
          amount: pd.value,
          source: proj,
        });
        commands.add(proj, PendingDespawn);
        break;
      }
    }
  }

  const { delta } = world.resource(Time);
  for (const [enemy] of enemies) {
    const et = world.get(enemy, Transform)!;
    const ec = world.get(enemy, Collider)!;
    const enemyDamage = world.get(enemy, Damage)?.value ?? 8;
    for (const [player, pt, pc] of players) {
      const dx = pt.x - et.x;
      const dz = pt.z - et.z;
      const r = pc.radius + ec.radius;
      if (dx * dx + dz * dz <= r * r) {
        world.send(DamageEvent, {
          target: player,
          amount: enemyDamage * delta,
          source: enemy,
        });
      }
    }
  }
}

export function applyDamage(world: World): void {
  for (const evt of world.events(DamageEvent)) {
    if (!world.isAlive(evt.target)) continue;
    if (world.has(evt.target, Dead) || world.has(evt.target, PendingDespawn)) {
      continue;
    }
    const health = world.get(evt.target, Health);
    if (!health) continue;
    health.value -= evt.amount;
  }
}

export function deathSystem(world: World, commands: Commands): void {
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
}

/** Final structural removal — runs after optional browser mesh cleanup. */
export function despawnPending(world: World, commands: Commands): void {
  for (const [entity] of world.query(PendingDespawn)) {
    commands.despawn(entity);
  }
}

export function tickMeta(world: World): void {
  world.resource(GameMeta).tick += 1;
}

export function restartSystem(world: World, commands: Commands): void {
  const input = world.resource(Input);
  if (!input.restartPressed) return;

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
    if (world.has(meta.player, PendingDespawn)) {
      world.remove(meta.player, PendingDespawn);
    }
  }

  const score = world.resource(Score);
  score.kills = 0;
  score.deaths = 0;
  Object.assign(world.resource(SpawnConfig), createDefaultSpawnConfig());
  meta.gameOver = false;
}

export function clearInputEdges(world: World): void {
  const input = world.resource(Input);
  input.firePressed = false;
  input.restartPressed = false;
}

export function addGameplaySystems(app: App): void {
  app
    .addSystem(FixedUpdate, playerMovement)
    .addSystem(FixedUpdate, enemySpawn)
    .addSystem(FixedUpdate, enemyAi)
    .addSystem(FixedUpdate, projectileSpawn)
    .addSystem(FixedUpdate, movement)
    .addSystem(FixedUpdate, lifetimeSystem)
    .addSystem(FixedUpdate, collision)
    .addSystem(FixedUpdate, applyDamage)
    .addSystem(FixedUpdate, deathSystem)
    // despawnPending is registered by the runner (headless/browser)
    // so view layers can detach meshes first.
    .addSystem(FixedUpdate, tickMeta)
    .addSystem(Update, restartSystem)
    .addSystem(Update, clearInputEdges);
}
