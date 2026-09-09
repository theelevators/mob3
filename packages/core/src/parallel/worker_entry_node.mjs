/**
 * Node worker_threads entry (plain ESM for reliable loading from tests/dist).
 * Browser uses worker_entry_browser.mjs.
 */
import { parentPort } from "node:worker_threads";

if (!parentPort) {
  throw new Error("mob3 worker_entry_node must run inside worker_threads");
}

parentPort.on("message", async (msg) => {
  if (!msg || msg.type !== "job") return;
  const { id, moduleUrl, exportName, payload } = msg;
  try {
    if (payload?.delayMs > 0) {
      await new Promise((r) => setTimeout(r, payload.delayMs));
    }
    const t0 = performance.now();
    const mod = await import(moduleUrl);
    const fn = mod[exportName];
    if (typeof fn !== "function") {
      throw new Error(`Export '${exportName}' not found in ${moduleUrl}`);
    }
    const result = fn(payload);
    const execMs = performance.now() - t0;
    parentPort.postMessage({
      type: "result",
      id,
      result: { ...result, execMs: result?.execMs ?? execMs },
    });
  } catch (err) {
    const error = err instanceof Error ? err.stack ?? err.message : String(err);
    parentPort.postMessage({ type: "error", id, error });
  }
});
