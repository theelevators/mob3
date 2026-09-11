/**
 * Parallel vs sequential numeric particle sim (Phase 5 demo).
 *
 * Batch 0 (independent): orbit, heatField, wobble
 * Batch 1: integrate (depends on velocity writes)
 */
import {
  App,
  FixedUpdate,
  Render,
  component,
  resource,
  workerSystem,
  system,
} from "@mob3/core";
import * as handlers from "./handlers.mjs";

const Position = component({ x: 0, y: 0, z: 0 }, "Position");
const Velocity = component({ x: 0, y: 0, z: 0 }, "Velocity");
const Heat = component({ v: 0 }, "Heat");
const Wobble = component({ v: 0 }, "Wobble");
const SimConfig = resource<{ dt: number; work: number }>("SimConfig");

const canvas = document.querySelector("#c") as HTMLCanvasElement;
const statsEl = document.querySelector("#stats") as HTMLDivElement;
const btnSeq = document.querySelector("#btn-seq") as HTMLButtonElement;
const btnPar = document.querySelector("#btn-par") as HTMLButtonElement;
const countSel = document.querySelector("#count") as HTMLSelectElement;
const workersSel = document.querySelector("#workers") as HTMLSelectElement;
const workSel = document.querySelector("#work") as HTMLSelectElement;

const ctx = canvas.getContext("2d")!;
let mode: "sequential" | "parallel" = "sequential";
let app: App | null = null;
let lastSimMs = 0;
let lastBarrier = 0;
let frames = 0;
let running = false;

const moduleUrl = new URL("./handlers.mjs", import.meta.url);

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
resize();
window.addEventListener("resize", resize);

function spawnWorld(a: App, n: number) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = 0.2 + (i % 50) / 80;
    a.world.spawn(
      Position({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        z: 0,
      }),
      Velocity({
        x: -Math.sin(ang) * 0.4,
        y: Math.cos(ang) * 0.4,
        z: 0,
      }),
      Heat({ v: (i % 100) / 100 }),
      Wobble({ v: (i % 17) / 17 }),
    );
  }
}

function buildApp(): App {
  const workers = Number(workersSel.value);
  const work = Number(workSel.value);
  const count = Number(countSel.value);

  const orbit = workerSystem({
    name: "orbit",
    module: moduleUrl,
    export: "orbit",
    run: handlers.orbit,
    access: {
      read: [Position],
      write: [Velocity],
      resources: { read: [SimConfig] },
    },
  });
  const heatField = workerSystem({
    name: "heatField",
    module: moduleUrl,
    export: "heatField",
    run: handlers.heatField,
    access: {
      read: [Position],
      write: [Heat],
      resources: { read: [SimConfig] },
    },
  });
  const wobble = workerSystem({
    name: "wobble",
    module: moduleUrl,
    export: "wobble",
    run: handlers.wobble,
    access: {
      read: [Position],
      write: [Wobble],
      resources: { read: [SimConfig] },
    },
  });
  const integrate = workerSystem({
    name: "integrate",
    module: moduleUrl,
    export: "integrate",
    run: handlers.integrate,
    access: {
      read: [Velocity],
      write: [Position, Velocity],
      resources: { read: [SimConfig] },
    },
  });

  const draw = system({
    name: "draw",
    access: { read: [Position, Heat] },
    run(world) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(12,18,24,0.4)";
      ctx.fillRect(0, 0, w, h);
      const scale = Math.min(w, h) * 0.42;
      let i = 0;
      for (const [, p, heat] of world.query(Position, Heat)) {
        if ((i++ & 3) !== 0) continue;
        const sx = w / 2 + p.x * scale;
        const sy = h / 2 + p.y * scale;
        const t = Math.max(0, Math.min(1, Math.abs(heat.v) * 4));
        ctx.fillStyle = `rgb(${Math.floor(60 + t * 180)}, ${Math.floor(200 - t * 80)}, ${Math.floor(180 - t * 40)})`;
        ctx.fillRect(sx, sy, 2 * devicePixelRatio, 2 * devicePixelRatio);
      }
    },
  });

  const a =
    mode === "parallel"
      ? new App({ parallel: { workers, mode: "preferred" } })
      : new App();

  a.insertResource(SimConfig, { dt: 1 / 60, work });
  a.setFixedDelta(1 / 60);
  a.addSystem(FixedUpdate, orbit, { before: integrate });
  a.addSystem(FixedUpdate, heatField, { before: integrate });
  a.addSystem(FixedUpdate, wobble, { before: integrate });
  a.addSystem(FixedUpdate, integrate);
  a.addSystem(Render, draw);
  spawnWorld(a, count);
  return a;
}

async function restart() {
  running = false;
  app?.dispose();
  app = buildApp();
  btnSeq.classList.toggle("active", mode === "sequential");
  btnPar.classList.toggle("active", mode === "parallel");
  const plan = app.inspectSchedule(FixedUpdate);
  console.log(
    "FixedUpdate batches",
    plan.batches.map((b) =>
      b.map((id) => plan.systems.find((s) => s.id === id)?.name),
    ),
  );
  running = true;
  void loop();
}

async function loop() {
  if (!running || !app) return;
  const t0 = performance.now();
  if (mode === "parallel") {
    await app.updateAsync(1 / 60);
    const timings = app.parallelExecutor?.lastBatchTimings() ?? [];
    lastBarrier = timings.reduce((s, t) => s + t.barrierMs, 0);
    app.parallelExecutor?.clearTimings();
  } else {
    app.update(1 / 60);
    lastBarrier = 0;
  }
  lastSimMs = performance.now() - t0;
  frames++;
  if (frames % 8 === 0) {
    const using = app.parallelExecutor?.usingWorkers ? "workers" : "fallback";
    const plan = app.inspectSchedule(FixedUpdate);
    const batch0 = plan.batches[0]
      ?.map((id) => plan.systems.find((s) => s.id === id)?.name)
      .join(", ");
    statsEl.innerHTML =
      `mode: <span class="hi">${mode}</span> (${using})\n` +
      `entities: ${countSel.value}\n` +
      `batch0: ${batch0}\n` +
      `sim frame: <span class="${lastSimMs > 12 ? "warn" : "hi"}">${lastSimMs.toFixed(2)} ms</span>\n` +
      (mode === "parallel"
        ? `batch barriers: ${lastBarrier.toFixed(2)} ms\n`
        : "") +
      `work/entity: ${workSel.value}`;
  }
  requestAnimationFrame(() => {
    void loop();
  });
}

btnSeq.onclick = () => {
  mode = "sequential";
  void restart();
};
btnPar.onclick = () => {
  mode = "parallel";
  void restart();
};
countSel.onchange = () => void restart();
workersSel.onchange = () => void restart();
workSel.onchange = () => void restart();

void restart();
