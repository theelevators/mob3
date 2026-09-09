/**
 * Parallel / worker entry — import from `mob3/parallel`.
 * Side-effect: registers App({ parallel: true }) support.
 */
import "./register.js";
import type { App } from "../app.js";
import {
  parallelExecutor,
  type ParallelExecutorOptions,
} from "./executor.js";
import { registerParallelFactory } from "../app.js";

registerParallelFactory(parallelExecutor);

export {
  parallelExecutor,
  ParallelExecutor,
  type ParallelExecutorOptions,
  type ParallelTimings,
  type ParallelDataPath,
} from "./executor.js";

export {
  createWorkerPool,
  workersSupported,
  type WorkerPool,
  type WorkerPoolOptions,
  type PoolMode,
} from "./pool.js";

export type {
  WorkerPayload,
  WorkerResult,
  WorkerWriteSlice,
  NumericSlice,
  WorkerEventBatch,
} from "./types.js";

export {
  isWorkerSafeComponent,
  getNumericLayout,
} from "./transfer.js";

export {
  workerSystem,
  getWorkerMeta,
  isWorkerSystem,
  runWorkerSystemLocal,
  type WorkerSystemDefinition,
  type WorkerSystemMeta,
  type WorkerDeclaredSystem,
} from "./worker_system.js";

/** Attach a parallel executor to an App from the browser-safe entry. */
export function installParallel(
  app: App,
  options: ParallelExecutorOptions = {},
): App {
  app.setParallelExecutor(parallelExecutor(options));
  return app;
}
