/**
 * Headless hierarchy lab — reparent / propagate / inspect without Three.
 */
import {
  App,
  Startup,
  Update,
  Name,
  Transform,
  GlobalTransform,
  type World,
} from "mob3";

let sat = 0;
let moonA = 0;
let planetA = 0;

function setup(world: World): void {
  const sun = world.spawn(Name({ value: "Sun" }), Transform());
  planetA = world.spawnChild(
    sun,
    Name({ value: "PlanetA" }),
    Transform({ x: 6 }),
  );
  moonA = world.spawnChild(
    planetA,
    Name({ value: "MoonA" }),
    Transform({ x: 1.4 }),
  );
  sat = world.spawnChild(
    moonA,
    Name({ value: "Satellite" }),
    Transform({ x: 0.45 }),
  );
  world.spawnChild(planetA, Name({ value: "Station" }), Transform({ z: 1.2 }));
  const planetB = world.spawnChild(
    sun,
    Name({ value: "PlanetB" }),
    Transform({ x: -5 }),
  );
  world.spawnChild(planetB, Name({ value: "MoonB" }), Transform({ y: 1.1 }));
}

const app = new App()
  .addSystem(Startup, setup)
  .addSystem(Update, (world) => {
    const t = world.getMut(planetA, Transform);
    if (t) t.ry += 0.1;
  });

app.update(1 / 60);
const g1 = app.world.get(sat, GlobalTransform)!;
app.world.setParent(sat, planetA, { preserve: "local" });
app.update(1 / 60);
const g2 = app.world.get(sat, GlobalTransform)!;
app.world.setParent(sat, moonA, { preserve: "global" });
app.update(1 / 60);
const g3 = app.world.get(sat, GlobalTransform)!;

console.log(
  JSON.stringify(
    {
      mode: "headless-hierarchy-lab",
      tree: app.world.formatHierarchy(),
      satelliteGlobals: { afterOrbit: g1, afterReparentLocal: g2, afterPreserveGlobal: g3 },
      validate: app.world.validateHierarchy(),
      inspect: app.world.inspect(sat),
    },
    null,
    2,
  ),
);

app.dispose();
