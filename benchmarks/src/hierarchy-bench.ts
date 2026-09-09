/**
 * Phase 9 hierarchy + change-detection benches.
 * Run: npm run bench:hierarchy
 */
import {
  World,
  Transform,
  GlobalTransform,
  transformPropagation,
} from "mob3";

function now() {
  return performance.now();
}

function propagate(world: World): void {
  transformPropagation(world, null as never);
}

function buildBalanced(n: number): World {
  const w = new World();
  w.beginFrame();
  const nodes: number[] = [];
  const root = w.spawn(Transform());
  nodes.push(root);
  while (nodes.length < n) {
    const parent = nodes[Math.floor((nodes.length - 1) / 2)]!;
    const child = w.spawnChild(parent, Transform({ x: 0.01, y: 0.01 }));
    nodes.push(child);
  }
  propagate(w);
  return w;
}

function buildWide(n: number): World {
  const w = new World();
  w.beginFrame();
  const root = w.spawn(Transform());
  for (let i = 1; i < n; i++) {
    w.spawnChild(root, Transform({ x: (i % 100) * 0.01 }));
  }
  propagate(w);
  return w;
}

function buildDeep(n: number): World {
  const w = new World();
  w.beginFrame();
  let prev = w.spawn(Transform());
  for (let i = 1; i < n; i++) {
    prev = w.spawnChild(prev, Transform({ y: 0.001 }));
  }
  propagate(w);
  return w;
}

function entitiesWithTransform(w: World): number[] {
  return [...w.query(Transform)].map(([e]) => e);
}

/** Prefer leaves so 1% change does not flood via root. */
function leafBiased(entities: number[], w: World): number[] {
  const leaves = entities.filter((e) => w.children(e).length === 0);
  return leaves.length > 0 ? leaves : entities;
}

function mutatePercent(w: World, pool: number[], pct: number): number {
  const count = Math.max(1, Math.floor((pool.length * pct) / 100));
  w.beginFrame();
  for (let i = 0; i < count; i++) {
    const e = pool[(i * 997 + 13) % pool.length]!;
    w.getMut(e, Transform)!.x += 0.001;
  }
  return count;
}

function benchShape(
  label: string,
  build: (n: number) => World,
  n: number,
  pct: number,
  iters: number,
): void {
  const w = build(n);
  const ents = entitiesWithTransform(w);
  const pool = leafBiased(ents, w);
  mutatePercent(w, pool, pct);
  propagate(w);

  let mutMs = 0;
  let propMs = 0;
  let changedGlobals = 0;
  let dirtyPeak = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = now();
    mutatePercent(w, pool, pct);
    dirtyPeak = Math.max(dirtyPeak, w.hierarchyDirtyCount());
    mutMs += now() - t0;
    const t1 = now();
    propagate(w);
    propMs += now() - t1;
    let c = 0;
    for (const _ of w.query(GlobalTransform).changed(GlobalTransform)) c++;
    changedGlobals += c;
  }

  console.log(
    [
      label.padEnd(10),
      String(n).padStart(6),
      `${pct}%`.padStart(5),
      (mutMs / iters).toFixed(3).padStart(8),
      (propMs / iters).toFixed(3).padStart(8),
      (changedGlobals / iters).toFixed(0).padStart(8),
      String(dirtyPeak).padStart(8),
    ].join("  "),
  );
}

function benchChangeOverhead(n: number): void {
  const wTrack = new World();
  const wBare = new World();
  wTrack.beginFrame();
  wBare.beginFrame();
  const entsT: number[] = [];
  const entsB: number[] = [];
  for (let i = 0; i < n; i++) {
    entsT.push(wTrack.spawn(Transform({ x: i })));
    entsB.push(wBare.spawn(Transform({ x: i })));
  }

  const iters = 50;
  let trackMs = 0;
  let bareMs = 0;
  for (let i = 0; i < iters; i++) {
    wTrack.beginFrame();
    const t0 = now();
    for (const e of entsT) wTrack.getMut(e, Transform)!.x += 1;
    trackMs += now() - t0;

    wBare.beginFrame();
    const t1 = now();
    for (const e of entsB) {
      const t = wBare.get(e, Transform)!;
      t.x += 1;
    }
    bareMs += now() - t1;
  }

  const memEstimate = n * 8 * 2;
  console.log(
    `\nchange-overhead n=${n}: getMut ${(trackMs / iters).toFixed(3)}ms vs bare get ${(bareMs / iters).toFixed(3)}ms; ~tick-map bytes≈${memEstimate}`,
  );
}

console.log("=== Phase 9 hierarchy bench ===\n");
console.log(
  [
    "shape".padEnd(10),
    "ents".padStart(6),
    "chg%".padStart(5),
    "mutMs".padStart(8),
    "propMs".padStart(8),
    "chgGlob".padStart(8),
    "dirtyPk".padStart(8),
  ].join("  "),
);

const sizes = [1_000, 10_000, 100_000];
const pcts = [1, 10, 100];
const builders: Array<[string, (n: number) => World]> = [
  ["balanced", buildBalanced],
  ["wide", buildWide],
  ["deep", buildDeep],
];

for (const [name, build] of builders) {
  for (const n of sizes) {
    if (name === "deep" && n >= 100_000) {
      console.log(
        `${"deep".padEnd(10)}  ${String(n).padStart(6)}  skip (pathological depth)`,
      );
      continue;
    }
    const iters = n >= 100_000 ? 3 : n >= 10_000 ? 8 : 20;
    for (const pct of pcts) {
      try {
        benchShape(name, build, n, pct, iters);
      } catch (e) {
        console.log(`${name} n=${n} pct=${pct} FAILED`, e);
      }
    }
  }
}

benchChangeOverhead(10_000);
benchChangeOverhead(100_000);

console.log("\ndone");
