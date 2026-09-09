/**
 * Phase 11 animation benches.
 * Run: npm run bench:animation
 */
import { App, Transform, GlobalTransform, Name } from "mob3";
import { AssetsPlugin, getAssets } from "@mob3/assets";
import {
  GltfAsset,
  createGltfLoader,
  AnimationPlugin,
  BoneAttachment,
  instantiateAnimatedGltf,
  createProceduralCharacterAsset,
  playAnimation,
  animationMixerUpdate,
  boneAttachmentSample,
  animationIntent,
  animationEventFlush,
} from "@mob3/three";

function now() {
  return performance.now();
}

function makeApp() {
  const app = new App()
    .addPlugin(AssetsPlugin({ json: false }))
    .addPlugin(AnimationPlugin());
  const assets = getAssets(app.world);
  assets.registerLoader(GltfAsset, {
    async load() {
      throw new Error("unused");
    },
    dispose(v) {
      createGltfLoader().dispose?.(v);
    },
  });
  const data = createProceduralCharacterAsset();
  const handle = assets.insert(GltfAsset, "character.glb", data);
  return { app, handle, data };
}

function bench(n: number, withAttach: boolean): void {
  const { app, handle, data } = makeApp();
  const ents = [];
  for (let i = 0; i < n; i++) {
    const e = instantiateAnimatedGltf(app.world, handle, {
      clip: ["Idle", "Walk", "Run"][i % 3],
      name: `C${i}`,
    });
    app.world.getMut(e, Transform)!.x = (i % 20) * 0.5;
    playAnimation(app.world, e, ["Idle", "Walk", "Run"][i % 3]!, {
      speed: 0.5 + (i % 5) * 0.25,
      fadeDuration: 0,
    });
    ents.push(e);
    if (withAttach) {
      app.world.spawn(
        Name({ value: `S${i}` }) as never,
        Transform() as never,
        GlobalTransform() as never,
        BoneAttachment({ source: e, bone: "RightHand" }) as never,
      );
    }
  }

  // Warmup
  for (let i = 0; i < 5; i++) app.update(1 / 60);

  const frames = 60;
  const t0 = now();
  for (let i = 0; i < frames; i++) app.update(1 / 60);
  const total = now() - t0;

  // Isolated system cost (approx) — one more frame's systems timed
  const tIntent0 = now();
  for (let i = 0; i < frames; i++) animationIntent(app.world, null as never);
  const intentMs = now() - tIntent0;

  const tMix0 = now();
  for (let i = 0; i < frames; i++) animationMixerUpdate(app.world, null as never);
  const mixerMs = now() - tMix0;

  const tAtt0 = now();
  for (let i = 0; i < frames; i++) boneAttachmentSample(app.world, null as never);
  const attachMs = now() - tAtt0;

  void animationEventFlush;

  console.log(
    `n=${String(n).padStart(4)} attach=${withAttach ? "Y" : "N"} ` +
      `frame60=${total.toFixed(2)}ms (${(total / frames).toFixed(3)}ms/f) ` +
      `intent=${(intentMs / frames).toFixed(3)}ms/f ` +
      `mixer=${(mixerMs / frames).toFixed(3)}ms/f ` +
      `attach=${(attachMs / frames).toFixed(3)}ms/f ` +
      `geo=${data.geometries.size} clips=${data.clips.length}`,
  );
  app.dispose();
}

console.log("=== Phase 11 animation bench ===\n");

for (const n of [1, 10, 100, 500]) {
  bench(n, false);
  bench(n, true);
}

console.log("\ndone");
