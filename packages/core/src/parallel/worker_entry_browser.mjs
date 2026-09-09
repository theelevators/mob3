/**
 * Browser Worker entry (module worker).
 */
self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== "job") return;
  const { id, moduleUrl, exportName, payload } = msg;
  try {
    if (payload?.delayMs > 0) {
      await new Promise((r) => setTimeout(r, payload.delayMs));
    }
    const t0 = performance.now();
    const mod = await import(/* @vite-ignore */ moduleUrl);
    const fn = mod[exportName];
    if (typeof fn !== "function") {
      throw new Error(`Export '${exportName}' not found in ${moduleUrl}`);
    }
    const result = fn(payload);
    const execMs = performance.now() - t0;
    self.postMessage({
      type: "result",
      id,
      result: { ...result, execMs: result?.execMs ?? execMs },
    });
  } catch (err) {
    const error = err instanceof Error ? err.stack ?? err.message : String(err);
    self.postMessage({ type: "error", id, error });
  }
};
