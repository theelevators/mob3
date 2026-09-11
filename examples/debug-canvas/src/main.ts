/**
 * Deliberately primitive Canvas2D renderer for Mob Arena.
 * Proves gameplay does not depend on Three.js.
 */
import {
  App,
  Render,
  Update,
  PendingDespawn,
  Transform,
  resource,
  type World,
  type Plugin,
} from "@mob3/core";
import { InputPlugin } from "@mob3/input";
import { initRapier, RapierPlugin } from "@mob3/rapier";
import { MobArenaPlugin } from "../../mob-arena/src/systems.js";
import {
  Player,
  Enemy,
  Projectile,
  Health,
  Score,
  GameMeta,
} from "../../mob-arena/src/components.js";

type CanvasRes = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  viewSize: number;
};

const DebugCanvas = resource<CanvasRes>("DebugCanvas");

export type DebugCanvasOptions = {
  canvas: HTMLCanvasElement;
  viewSize?: number;
};

function DebugCanvasPlugin(options: DebugCanvasOptions): Plugin {
  const viewSize = options.viewSize ?? 40;

  return {
    build(app) {
      const canvas = options.canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("DebugCanvasPlugin: 2d context unavailable");

      const resize = () => {
        canvas.width = canvas.clientWidth * devicePixelRatio;
        canvas.height = canvas.clientHeight * devicePixelRatio;
      };
      resize();
      window.addEventListener("resize", resize);
      app.onDispose(() => window.removeEventListener("resize", resize));

      app.insertResource(DebugCanvas, { canvas, ctx, viewSize });
      app.addSystem(Render, drawArena);
    },
  };
}

function drawArena(world: World): void {
  const { canvas, ctx, viewSize } = world.resource(DebugCanvas);
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, w, h);

  const scale = Math.min(w, h) / viewSize;
  const toScreen = (x: number, z: number) => ({
    sx: w / 2 + x * scale,
    sy: h / 2 + z * scale,
  });

  ctx.strokeStyle = "#1a222c";
  ctx.strokeRect(w / 2 - 18 * scale, h / 2 - 18 * scale, 36 * scale, 36 * scale);

  for (const [entity, t] of world.query(Transform).with(Enemy).without(PendingDespawn)) {
    const { sx, sy } = toScreen(t.x, t.z);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(sx - 6, sy - 6, 12, 12);
    const hp = world.get(entity, Health);
    if (hp) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx - 8, sy - 12, 16 * Math.max(0, hp.value / 30), 3);
    }
  }

  for (const [, t] of world
    .query(Transform)
    .with(Projectile)
    .without(PendingDespawn)) {
    const { sx, sy } = toScreen(t.x, t.z);
    ctx.fillStyle = "#ffe66d";
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const [entity, t] of world
    .query(Transform)
    .with(Player)
    .without(PendingDespawn)) {
    const { sx, sy } = toScreen(t.x, t.z);
    ctx.fillStyle = "#4ecdc4";
    ctx.fillRect(sx - 8, sy - 8, 16, 16);
    const hp = world.get(entity, Health);
    if (hp) {
      ctx.fillStyle = "#4ecdc4";
      ctx.fillRect(sx - 10, sy - 14, 20 * Math.max(0, hp.value / 100), 3);
    }
  }
}

const canvasEl = document.querySelector("#c") as HTMLCanvasElement;
const hud = document.querySelector("#hud") as HTMLDivElement;

await initRapier();

const app = new App()
  .addPlugin(InputPlugin({ preventDefault: ["Space"] }))
  .addPlugin(RapierPlugin({ gravity: { x: 0, y: 0, z: 0 } }))
  .addPlugin(DebugCanvasPlugin({ canvas: canvasEl }))
  .addPlugin(MobArenaPlugin({ seed: 7 }));

app.addSystem(Update, (world) => {
  const score = world.resource(Score);
  const meta = world.resource(GameMeta);
  const health = world.get(meta.player, Health)?.value ?? 0;
  hud.textContent = meta.gameOver
    ? `GAME OVER — kills ${score.kills} — R restart (canvas)`
    : `HP ${Math.ceil(health)} · kills ${score.kills} · canvas renderer · WASD · Space · R`;
});

app.run();
