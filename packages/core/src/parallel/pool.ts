import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { WorkerPayload, WorkerResult, WorkerJobResponse } from "./types.js";

export type PoolMode = "preferred" | "required";

export type WorkerPoolOptions = {
  workers?: number;
  mode?: PoolMode;
  /** Override worker entry path/URL (tests). */
  workerUrl?: URL | string;
};

type Pending = {
  resolve: (r: WorkerResult) => void;
  reject: (e: Error) => void;
  systemName: string;
  worker: Adapter;
};

type Adapter = {
  post(msg: unknown): void;
  terminate(): void;
};

export interface WorkerPool {
  readonly size: number;
  readonly available: boolean;
  runJob(
    moduleUrl: string,
    exportName: string,
    payload: WorkerPayload,
    systemName: string,
  ): Promise<WorkerResult>;
  dispose(): void;
}

function isNode(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

function resolveWorkerCount(requested?: number): number {
  let hw = 4;
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    hw = navigator.hardwareConcurrency;
  } else if (isNode()) {
    try {
      const req = createRequire(import.meta.url);
      hw = (req("node:os") as typeof import("node:os")).cpus().length || 4;
    } catch {
      hw = 4;
    }
  }
  const def = Math.min(Math.max(1, hw - 1), 4);
  return Math.max(1, requested ?? def);
}

function nodeEntryPath(override?: URL | string): string {
  if (override) {
    return typeof override === "string" ? override : fileURLToPath(override);
  }
  return fileURLToPath(new URL("./worker_entry_node.mjs", import.meta.url));
}

function browserEntryHref(override?: URL | string): string {
  if (override) return String(override);
  return new URL("./worker_entry_browser.mjs", import.meta.url).href;
}

/**
 * Reusable worker pool (Node worker_threads or browser module Workers).
 */
export function createWorkerPool(options: WorkerPoolOptions = {}): WorkerPool {
  const mode = options.mode ?? "preferred";
  const size = resolveWorkerCount(options.workers);
  const pending = new Map<number, Pending>();
  const idle: Adapter[] = [];
  const all: Adapter[] = [];
  let nextId = 1;
  let disposed = false;
  let available = false;

  const finish = (id: number, data: WorkerJobResponse) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    idle.push(p.worker);
    if (data.type === "error") {
      p.reject(
        new Error(`Worker system "${p.systemName}" failed:\n${data.error}`),
      );
    } else {
      p.resolve(data.result);
    }
  };

  try {
    if (isNode()) {
      const req = createRequire(import.meta.url);
      const { Worker } = req("node:worker_threads") as typeof import("node:worker_threads");
      const entry = nodeEntryPath(options.workerUrl);
      for (let i = 0; i < size; i++) {
        const w = new Worker(entry, { workerData: null });
        const adapter: Adapter = {
          post: (msg) => w.postMessage(msg),
          terminate: () => {
            void w.terminate();
          },
        };
        w.on("message", (data: WorkerJobResponse) => finish(data.id, data));
        w.on("error", (err) => {
          console.error("[mob3] worker error", err);
        });
        all.push(adapter);
        idle.push(adapter);
      }
      available = true;
    } else if (typeof Worker !== "undefined") {
      const entry = browserEntryHref(options.workerUrl);
      for (let i = 0; i < size; i++) {
        const w = new Worker(entry, { type: "module" });
        const adapter: Adapter = {
          post: (msg) => w.postMessage(msg),
          terminate: () => w.terminate(),
        };
        w.onmessage = (ev) => {
          const data = ev.data as WorkerJobResponse;
          finish(data.id, data);
        };
        all.push(adapter);
        idle.push(adapter);
      }
      available = true;
    } else if (mode === "required") {
      throw new Error("Workers unavailable and parallel mode is 'required'");
    }
  } catch (err) {
    for (const w of all) w.terminate();
    all.length = 0;
    idle.length = 0;
    available = false;
    if (mode === "required") throw err;
  }

  const waiters: Array<() => void> = [];

  function acquire(): Promise<Adapter> {
    if (idle.length) return Promise.resolve(idle.pop()!);
    return new Promise((resolve) => {
      waiters.push(() => resolve(idle.pop()!));
    });
  }

  function releaseSignal() {
    while (waiters.length && idle.length) {
      waiters.shift()!();
    }
  }

  // Wrap finish to signal waiters — patch by replacing idle push
  const origFinish = finish;
  // re-bind: monkey by wrapping pending resolution already pushes idle;
  // call releaseSignal after idle.push in finish — rewrite finish:

  return {
    size: available ? all.length : size,
    available,
    async runJob(moduleUrl, exportName, payload, systemName) {
      if (disposed) throw new Error("WorkerPool has been disposed");
      if (!available) throw new Error("WorkerPool unavailable");

      const worker = await acquire();
      const id = nextId++;
      return new Promise<WorkerResult>((resolve, reject) => {
        pending.set(id, {
          resolve: (r) => {
            idle.push(worker);
            releaseSignal();
            resolve(r);
          },
          reject: (e) => {
            idle.push(worker);
            releaseSignal();
            reject(e);
          },
          systemName,
          worker,
        });
        worker.post({
          type: "job",
          id,
          moduleUrl,
          exportName,
          payload,
        });
        void origFinish;
      });
    },
    dispose() {
      disposed = true;
      for (const [, p] of pending) {
        p.reject(new Error("WorkerPool disposed during job"));
      }
      pending.clear();
      for (const w of all) w.terminate();
      all.length = 0;
      idle.length = 0;
      waiters.length = 0;
    },
  };
}

/** Whether this environment can construct Workers. */
export function workersSupported(): boolean {
  if (isNode()) return true;
  return typeof Worker !== "undefined";
}
