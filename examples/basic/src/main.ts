/**
 * Headless smoke example — no Three.js required.
 */
import { App, Update, Startup, Time, component, type World } from "@mob3/core";

const Position = component({ x: 0, y: 0 });
const Velocity = component({ x: 0, y: 0 });

function setup(world: World) {
  world.spawn(Position({ x: 0, y: 0 }), Velocity({ x: 1, y: 0.5 }));
}

function movement(world: World) {
  const { delta } = world.resource(Time);
  for (const [, position, velocity] of world.query(Position, Velocity)) {
    position.x += velocity.x * delta;
    position.y += velocity.y * delta;
  }
}

const app = new App()
  .addSystem(Startup, setup)
  .addSystem(Update, movement);

for (let i = 0; i < 60; i++) {
  app.update(1 / 60);
}

const [, pos] = app.world.query(Position).collect()[0]!;
console.log(`after 1s: position=(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)})`);
