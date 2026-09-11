#!/usr/bin/env node
/**
 * Publish mob3 workspace packages in dependency order.
 *
 *   node scripts/publish-packages.mjs --dry-run
 *   node scripts/publish-packages.mjs
 */
import { spawnSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");

/** @type {string[]} workspace package names in publish order */
const PACKAGES = [
  "@mob3/core",
  "@mob3/assets",
  "@mob3/input",
  "@mob3/three",
  "@mob3/rapier",
  "@mob3/react",
];

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  dryRun
    ? "publish-packages: dry-run (no upload)"
    : "publish-packages: publishing to npm",
);

for (const name of PACKAGES) {
  const args = ["publish", "-w", name, "--access", "public"];
  if (dryRun) args.push("--dry-run");
  run("npm", args);
}

console.log(
  dryRun
    ? "\npublish-packages: dry-run OK"
    : "\npublish-packages: all packages published. Tag with: git tag v0.1.0 && git push origin v0.1.0",
);
