/**
 * Phase 10 asset registry benches (deterministic fake loader).
 * Run: npm run bench:assets
 */
import { App } from "@mob3/core";
import {
  AssetsPlugin,
  FakeAsset,
  createFakeLoader,
  getAssets,
} from "@mob3/assets";

function now() {
  return performance.now();
}

async function flush(app: App): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  app.update(1 / 60);
}

console.log("=== Phase 10 assets bench ===\n");

{
  const fake = createFakeLoader();
  const app = new App().addPlugin(AssetsPlugin({ json: false }));
  const assets = getAssets(app.world);
  assets.registerLoader(FakeAsset, fake.loader);
  const t0 = now();
  for (let i = 0; i < 1000; i++) assets.load(FakeAsset, "same");
  const dedupeMs = now() - t0;
  console.log(`dedupe 1000× same key: ${dedupeMs.toFixed(3)}ms invocations=${fake.invocations()}`);
  fake.controllerFor("same").resolve();
  await flush(app);
  const t1 = now();
  for (let i = 0; i < 10_000; i++) assets.isReady(assets.load(FakeAsset, "same"));
  console.log(`ready lookup 10k: ${(now() - t1).toFixed(3)}ms`);
  app.dispose();
}

{
  for (const n of [10, 100, 1000, 10_000]) {
    const fake = createFakeLoader();
    const app = new App().addPlugin(AssetsPlugin({ json: false }));
    const assets = getAssets(app.world);
    assets.registerLoader(FakeAsset, fake.loader);
    const handles = Array.from({ length: n }, (_, i) =>
      assets.load(FakeAsset, `k${i}`),
    );
    for (let i = 0; i < n; i++) fake.controllerFor(`k${i}`).resolve();
    await Promise.resolve();
    await Promise.resolve();
    const t0 = now();
    app.update(1 / 60);
    const ms = now() - t0;
    console.log(`transition flush n=${String(n).padStart(5)}: ${ms.toFixed(3)}ms ready=${handles.filter((h) => assets.isReady(h)).length}`);
    app.dispose();
  }
}

console.log("\ndone");
