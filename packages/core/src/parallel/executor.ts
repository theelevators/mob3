import type { World } from "../world.js";
import { Commands } from "../commands.js";
import { getSystemMeta } from "../system.js";
import type { SystemFn, ScheduleLabel } from "../schedule.js";
import type { CompiledSchedule, ExecutionPlan } from "../execution_plan.js";
import type { TimingStore } from "../execution_plan.js";
import {
  extractWorkerPayloadWithKeys,
  validateWorkerResult,
  commitWorkerWrites,
  commitWorkerEvents,
  getNumericLayout,
} from "./transfer.js";
import { getWorkerMeta, type WorkerSystemMeta } from "./worker_system.js";
import {
  createWorkerPool,
  type WorkerPool,
  type WorkerPoolOptions,
  type PoolMode,
} from "./pool.js";
import type { WorkerResult } from "./types.js";

export type ParallelTimings = {
  dispatchMs: number;
  execMs: number;
  transferMs: number;
  commitMs: number;
  barrierMs: number;
};

export type ParallelExecutorOptions = WorkerPoolOptions & {
  mode?: PoolMode;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function writeNamesFor(meta: WorkerSystemMeta): Set<string> {
  const names = new Set<string>();
  for (const c of meta.access.componentWrite) {
    const layout = getNumericLayout(c);
    if (layout) names.add(layout.name);
  }
  return names;
}

function resolveDelay(meta: WorkerSystemMeta): number | undefined {
  const d = meta.delayMs;
  if (d === undefined) return undefined;
  return typeof d === "function" ? d() : d;
}

/**
 * Executes a compiled plan using Phase 4 batches.
 * Worker-eligible systems may run concurrently; main systems in the same
 * batch run on the main thread concurrently with dispatches (Promise.all).
 * Writes commit at the barrier in plan order.
 */
export class ParallelExecutor {
  readonly pool: WorkerPool;
  readonly mode: PoolMode;
  private readonly batchTimings: ParallelTimings[] = [];
  private active = false;

  constructor(options: ParallelExecutorOptions = {}) {
    this.mode = options.mode ?? "preferred";
    this.pool = createWorkerPool(options);
  }

  get usingWorkers(): boolean {
    return this.pool.available;
  }

  dispose(): void {
    this.pool.dispose();
  }

  /**
   * Async schedule run. Sequential semantics via barriers.
   */
  async run(
    compiled: CompiledSchedule,
    world: World,
    timings?: TimingStore,
  ): Promise<void> {
    if (this.active) {
      throw new Error(
        "ParallelExecutor: overlapping frame/schedule execution is not allowed",
      );
    }
    this.active = true;
    try {
      const { plan, runOrder } = compiled;
      if (runOrder.length === 0) return;

      const fnById = new Map<symbol, SystemFn>();
      for (let i = 0; i < plan.order.length; i++) {
        fnById.set(plan.order[i]!, runOrder[i]!);
      }

      const commands = new Commands(world);

      for (let bi = 0; bi < plan.batches.length; bi++) {
        const batch = plan.batches[bi]!;
        const barrierStart = nowMs();

        type Job = {
          id: symbol;
          fn: SystemFn;
          meta: WorkerSystemMeta | null;
          kind: "worker" | "main";
        };
        const jobs: Job[] = batch.map((id) => {
          const fn = fnById.get(id)!;
          const wmeta = getWorkerMeta(fn);
          return {
            id,
            fn,
            meta: wmeta ?? null,
            kind: wmeta ? "worker" : "main",
          };
        });

        // Prepare worker payloads (snapshot) before any execution
        type Prepared = {
          job: Job;
          payloadCtx?: ReturnType<typeof extractWorkerPayloadWithKeys>;
          result?: WorkerResult;
          error?: Error;
          dispatchMs: number;
          transferMs: number;
        };
        const prepared: Prepared[] = jobs.map((job) => {
          if (job.kind === "worker" && job.meta) {
            const t0 = nowMs();
            const payloadCtx = extractWorkerPayloadWithKeys(
              world,
              job.meta.access,
              job.meta.resourceKeys,
              job.meta.eventTypes,
              resolveDelay(job.meta),
            );
            return {
              job,
              payloadCtx,
              dispatchMs: 0,
              transferMs: nowMs() - t0,
            };
          }
          return { job, dispatchMs: 0, transferMs: 0 };
        });

        // Execute all jobs concurrently
        await Promise.all(
          prepared.map(async (p) => {
            const tDispatch = nowMs();
            try {
              if (p.job.kind === "worker" && p.job.meta && p.payloadCtx) {
                if (this.pool.available) {
                  p.result = await this.pool.runJob(
                    p.job.meta.moduleUrl,
                    p.job.meta.exportName,
                    p.payloadCtx.payload,
                    p.job.meta.name,
                  );
                } else if (this.mode === "required") {
                  throw new Error(
                    `Workers unavailable (required) for '${p.job.meta.name}'`,
                  );
                } else {
                  // preferred fallback: same handler as sequential, on main
                  const t0 = nowMs();
                  const result = p.job.meta.handler(p.payloadCtx.payload);
                  p.result = { ...result, execMs: result.execMs ?? nowMs() - t0 };
                }
                validateWorkerResult(
                  p.result,
                  writeNamesFor(p.job.meta),
                  p.job.meta.name,
                );
              } else {
                // main-thread system
                const t0 = nowMs();
                p.job.fn(world, commands);
                commands.flush();
                if (timings) {
                  timings.record(getSystemMeta(p.job.fn).id, nowMs() - t0);
                }
              }
            } catch (err) {
              p.error =
                err instanceof Error ? err : new Error(String(err));
            }
            p.dispatchMs = nowMs() - tDispatch;
          }),
        );

        // Fail before commit if any error
        const failed = prepared.find((p) => p.error);
        if (failed) {
          throw failed.error;
        }

        // Commit worker writes in plan order (batch subset order = plan order)
        const tCommit = nowMs();
        for (const p of prepared) {
          if (p.job.kind !== "worker" || !p.result || !p.payloadCtx || !p.job.meta) {
            continue;
          }
          commitWorkerWrites(world, p.result.writes, p.payloadCtx.ctx);
          commitWorkerEvents(world, p.result.events, p.payloadCtx.ctx);
          if (timings) {
            timings.record(
              p.job.meta.id,
              (p.result.execMs ?? 0) + p.transferMs,
            );
          }
        }
        const commitMs = nowMs() - tCommit;
        const barrierMs = nowMs() - barrierStart;

        this.batchTimings.push({
          dispatchMs: Math.max(...prepared.map((p) => p.dispatchMs), 0),
          execMs: Math.max(
            ...prepared.map((p) => p.result?.execMs ?? 0),
            0,
          ),
          transferMs: prepared.reduce((a, p) => a + p.transferMs, 0),
          commitMs,
          barrierMs,
        });
      }
    } finally {
      this.active = false;
    }
  }

  lastBatchTimings(): readonly ParallelTimings[] {
    return this.batchTimings;
  }

  clearTimings(): void {
    this.batchTimings.length = 0;
  }
}

export type ScheduleRunner = {
  run(label: ScheduleLabel, world: World): void;
  runAsync?(label: ScheduleLabel, world: World): Promise<void>;
};

/** Factory for App configuration. */
export function parallelExecutor(
  options: ParallelExecutorOptions = {},
): ParallelExecutor {
  return new ParallelExecutor(options);
}

export type { ExecutionPlan };
