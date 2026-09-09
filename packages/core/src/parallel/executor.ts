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
import type { WorkerPayload, WorkerResult } from "./types.js";
import {
  canUseSharedPath,
  extractSharedWorkerPayload,
  type SharedWorkerPayload,
} from "./shared_path.js";

export type ParallelTimings = {
  dispatchMs: number;
  execMs: number;
  transferMs: number;
  commitMs: number;
  barrierMs: number;
  path?: "copy" | "shared" | "main";
};

export type ParallelDataPath = "copy" | "shared" | "auto";

export type ParallelExecutorOptions = WorkerPoolOptions & {
  mode?: PoolMode;
  /**
   * copy — always Phase 5 extract/commit
   * shared — require shared stores (error if unavailable)
   * auto — shared when all accesses are SharedPackedStorage (default)
   */
  dataPath?: ParallelDataPath;
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
 * Chooses copy vs shared SAB path per worker system.
 */
export class ParallelExecutor {
  readonly pool: WorkerPool;
  readonly mode: PoolMode;
  readonly dataPath: ParallelDataPath;
  private readonly batchTimings: ParallelTimings[] = [];
  private active = false;

  constructor(options: ParallelExecutorOptions = {}) {
    this.mode = options.mode ?? "preferred";
    this.dataPath = options.dataPath ?? "auto";
    this.pool = createWorkerPool(options);
  }

  get usingWorkers(): boolean {
    return this.pool.available;
  }

  dispose(): void {
    this.pool.dispose();
  }

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

        type Prepared = {
          job: Job;
          path: "copy" | "shared" | "main";
          payloadCtx?: ReturnType<typeof extractWorkerPayloadWithKeys>;
          sharedPayload?: SharedWorkerPayload;
          result?: WorkerResult;
          error?: Error;
          dispatchMs: number;
          transferMs: number;
        };

        const prepared: Prepared[] = jobs.map((job) => {
          if (job.kind !== "worker" || !job.meta) {
            return { job, path: "main", dispatchMs: 0, transferMs: 0 };
          }
          const t0 = nowMs();
          const wantShared =
            this.dataPath === "shared" ||
            (this.dataPath === "auto" && canUseSharedPath(world, job.meta));
          if (this.dataPath === "shared" && !canUseSharedPath(world, job.meta)) {
            throw new Error(
              `dataPath=shared but system '${job.meta.name}' lacks SharedPackedStorage accesses`,
            );
          }
          if (wantShared && canUseSharedPath(world, job.meta)) {
            const sharedPayload = extractSharedWorkerPayload(
              world,
              job.meta,
              resolveDelay(job.meta),
            );
            return {
              job,
              path: "shared",
              sharedPayload,
              dispatchMs: 0,
              transferMs: nowMs() - t0,
            };
          }
          const payloadCtx = extractWorkerPayloadWithKeys(
            world,
            job.meta.access,
            job.meta.resourceKeys,
            job.meta.eventTypes,
            resolveDelay(job.meta),
          );
          return {
            job,
            path: "copy",
            payloadCtx,
            dispatchMs: 0,
            transferMs: nowMs() - t0,
          };
        });

        await Promise.all(
          prepared.map(async (p) => {
            const tDispatch = nowMs();
            try {
              if (p.job.kind === "worker" && p.job.meta) {
                const payload: WorkerPayload | SharedWorkerPayload =
                  p.path === "shared"
                    ? p.sharedPayload!
                    : p.payloadCtx!.payload;

                if (this.pool.available) {
                  p.result = await this.pool.runJob(
                    p.job.meta.moduleUrl,
                    p.job.meta.exportName,
                    payload as WorkerPayload,
                    p.job.meta.name,
                  );
                } else if (this.mode === "required") {
                  throw new Error(
                    `Workers unavailable (required) for '${p.job.meta.name}'`,
                  );
                } else if (p.path === "shared") {
                  // Fallback: run handler on main with reconstructed shared views
                  // Prefer sequential SystemFn path for correctness
                  const t0 = nowMs();
                  p.job.fn(world, commands);
                  commands.flush();
                  p.result = { writes: [], execMs: nowMs() - t0 };
                } else {
                  const t0 = nowMs();
                  const result = p.job.meta.handler(p.payloadCtx!.payload);
                  p.result = {
                    ...result,
                    execMs: result.execMs ?? nowMs() - t0,
                  };
                }

                if (p.path === "copy") {
                  validateWorkerResult(
                    p.result,
                    writeNamesFor(p.job.meta),
                    p.job.meta.name,
                  );
                } else if (p.result.writes?.length) {
                  // Shared path should not return undeclared component copies
                  validateWorkerResult(
                    p.result,
                    writeNamesFor(p.job.meta),
                    p.job.meta.name,
                  );
                }
              } else {
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

        const failed = prepared.find((p) => p.error);
        if (failed) throw failed.error;

        const tCommit = nowMs();
        for (const p of prepared) {
          if (p.job.kind !== "worker" || !p.result || !p.job.meta) continue;
          if (p.path === "copy" && p.payloadCtx) {
            commitWorkerWrites(world, p.result.writes, p.payloadCtx.ctx);
            commitWorkerEvents(world, p.result.events, p.payloadCtx.ctx);
          } else if (p.path === "shared") {
            // Field data already in SAB; events still need merge if any
            if (p.result.events?.length && p.payloadCtx) {
              commitWorkerEvents(world, p.result.events, p.payloadCtx.ctx);
            } else if (p.result.events?.length) {
              // Build minimal event commit via world.send using meta.eventTypes
              for (const batch of p.result.events) {
                const et = p.job.meta.eventTypes.find(
                  (e) => (e.name ?? "Event") === batch.name,
                );
                if (!et) {
                  throw new Error(
                    `Worker returned unknown event '${batch.name}'`,
                  );
                }
                for (const payload of batch.payloads) {
                  world.send(et, payload as never);
                }
              }
            }
          }
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
          dispatchMs: Math.max(...prepared.map((x) => x.dispatchMs), 0),
          execMs: Math.max(...prepared.map((x) => x.result?.execMs ?? 0), 0),
          transferMs: prepared.reduce((a, x) => a + x.transferMs, 0),
          commitMs,
          barrierMs,
          path: prepared.some((x) => x.path === "shared")
            ? "shared"
            : prepared.some((x) => x.path === "copy")
              ? "copy"
              : "main",
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

export function parallelExecutor(
  options: ParallelExecutorOptions = {},
): ParallelExecutor {
  return new ParallelExecutor(options);
}

export type { ExecutionPlan };
