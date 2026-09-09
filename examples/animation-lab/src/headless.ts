/**
 * Headless animation lab — A Run / B Idle→Run crossfade / C Walk @0.5x + attachment.
 */
import { App, Transform, GlobalTransform, Name } from "mob3";
import { AssetsPlugin, getAssets } from "@mob3/assets";
import {
  GltfAsset,
  createGltfLoader,
  AnimationPlugin,
  AnimationPlayer,
  BoneAttachment,
  instantiateAnimatedGltf,
  despawnAnimatedGltf,
  createProceduralCharacterAsset,
  playAnimation,
  crossfadeAnimation,
  animationStoreOf,
} from "@mob3/three";

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

const a = instantiateAnimatedGltf(app.world, handle, { name: "A" });
const b = instantiateAnimatedGltf(app.world, handle, { name: "B" });
const c = instantiateAnimatedGltf(app.world, handle, { name: "C" });
app.world.getMut(a, Transform)!.x = 10;
app.world.getMut(b, Transform)!.x = 0;
app.world.getMut(c, Transform)!.x = -10;

playAnimation(app.world, a, "Run", { speed: 1, fadeDuration: 0 });
playAnimation(app.world, b, "Idle", { speed: 1, fadeDuration: 0 });
playAnimation(app.world, c, "Walk", { speed: 0.5, fadeDuration: 0 });

const sword = app.world.spawn(
  Name({ value: "SwordA" }) as never,
  Transform() as never,
  GlobalTransform() as never,
  BoneAttachment({ source: a, bone: "RightHand" }) as never,
);

for (let i = 0; i < 60; i++) app.update(1 / 60);
crossfadeAnimation(app.world, b, "Run", 0.1);
for (let i = 0; i < 30; i++) app.update(1 / 60);

const pa = app.world.get(a, AnimationPlayer)!;
const pb = app.world.get(b, AnimationPlayer)!;
const pc = app.world.get(c, AnimationPlayer)!;
const gSword = app.world.get(sword, GlobalTransform)!;

const ok =
  pa.clip === "Run" &&
  pb.clip === "Run" &&
  pc.clip === "Walk" &&
  pc.speed === 0.5 &&
  gSword.x > 5 &&
  animationStoreOf(app.world).size() === 3;

console.log(
  JSON.stringify(
    {
      mode: "headless-animation-lab",
      clips: { a: pa.clip, b: pb.clip, c: pc.clip },
      speeds: { a: pa.speed, b: pb.speed, c: pc.speed },
      swordX: gSword.x,
      runtimes: animationStoreOf(app.world).size(),
      ok,
    },
    null,
    2,
  ),
);

despawnAnimatedGltf(app.world, a);
app.update(1 / 60);
if (app.world.has(sword, BoneAttachment)) {
  throw new Error("sword should detach when source despawns");
}

app.dispose();
if (!ok) process.exit(1);
