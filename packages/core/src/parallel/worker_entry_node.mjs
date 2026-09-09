/**
 * Node worker entry — supports Phase 5 copy jobs and Phase 6 shared SAB jobs.
 */
import { parentPort } from "node:worker_threads";

if (!parentPort) {
  throw new Error("mob3 worker_entry_node must run inside worker_threads");
}

function columnsFromDesc(desc) {
  const bytesPerField = (kind) =>
    kind === "f64" ? 8 : 4;
  const make = (kind, buffer, offset, length) => {
    switch (kind) {
      case "f32":
        return new Float32Array(buffer, offset, length);
      case "f64":
        return new Float64Array(buffer, offset, length);
      case "i32":
        return new Int32Array(buffer, offset, length);
      case "u32":
        return new Uint32Array(buffer, offset, length);
      default:
        throw new Error(`bad kind ${kind}`);
    }
  };
  const columns = {};
  let offset = desc.headerBytes;
  for (let f = 0; f < desc.fields.length; f++) {
    const kind = desc.kinds[f];
    const bpe = bytesPerField(kind);
    offset = Math.ceil(offset / bpe) * bpe;
    columns[desc.fields[f]] = make(kind, desc.sab, offset, desc.capacity);
    offset += bpe * desc.capacity;
  }
  const header = new Int32Array(desc.sab, 0, 4);
  return { columns, count: header[0], entities: desc.entities };
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

    let jobPayload = payload;
    if (payload?.mode === "shared" && payload.stores) {
      const stores = {};
      for (const [name, desc] of Object.entries(payload.stores)) {
        const { columns, count, entities } = columnsFromDesc(desc);
        stores[name] = { ...columns, count, entities, fields: desc.fields };
      }
      jobPayload = {
        mode: "shared",
        stores,
        resources: payload.resources ?? {},
        writeNames: payload.writeNames ?? [],
        delayMs: payload.delayMs,
      };
    }

    const result = fn(jobPayload);
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
