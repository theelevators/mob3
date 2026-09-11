#!/usr/bin/env node
/**
 * publish:check — fail if the browser-safe mob3 entry pulls Node builtins.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserEntry = join(root, "packages/core/dist/browser.js");

if (!existsSync(browserEntry)) {
  console.error("publish:check: missing", browserEntry, "— run npm run build first");
  process.exit(1);
}

const src = readFileSync(browserEntry, "utf8");
const banned = [
  /from\s+["']node:/,
  /require\(["']node:/,
  /node:worker_threads/,
  /node:fs/,
  /node:module/,
  /node:url/,
  /node:os/,
];

const hits = banned.filter((re) => re.test(src));
if (hits.length) {
  console.error("publish:check FAILED: browser entry contains Node imports:");
  for (const re of hits) console.error(" ", re);
  process.exit(1);
}

// Soft check: parallel public may use node (that's OK — different export).
const parallelEntry = join(root, "packages/core/dist/parallel/public.js");
if (existsSync(parallelEntry)) {
  console.log("publish:check: parallel entry present (Node OK on @mob3/core/parallel)");
}

console.log("publish:check OK —", browserEntry, "has no node: imports");
