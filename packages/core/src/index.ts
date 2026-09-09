export type { Entity } from "./entity.js";
export {
  INVALID_ENTITY,
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  entityIndex,
  entityGeneration,
  packEntity,
} from "./entity.js";

export {
  component,
  tag,
  isComponentType,
  COMPONENT_TYPE,
  IS_COMPONENT_TYPE,
  type ComponentType,
  type InferComponent,
  type ComponentBundleItem,
} from "./component.js";

export { World } from "./world.js";
export { Query, type QueryRow, type QueryTuple } from "./query.js";
export { Commands } from "./commands.js";

export {
  resource,
  IS_RESOURCE_TYPE,
  type ResourceType,
  type ResourceKey,
  type ResourceConstructor,
} from "./resource.js";

export { event, EventStore, type EventType } from "./event.js";

export {
  Schedule,
  Startup,
  PreUpdate,
  FixedUpdate,
  Update,
  PostUpdate,
  PreRender,
  Render,
  PostRender,
  DEFAULT_SCHEDULE_ORDER,
  type SystemFn,
  type ScheduleLabel,
  type SystemConstraints,
} from "./schedule.js";

export {
  system,
  getSystemMeta,
  peekSystemMeta,
  isDeclaredSystem,
  accessesConflict,
  normalizeAccess,
  type SystemDefinition,
  type AccessDeclaration,
  type SystemMeta,
  type SystemId,
  type DeclaredSystem,
  type NormalizedAccess,
} from "./system.js";

export {
  formatExecutionPlan,
  planToJson,
  type ExecutionPlan,
  type PlanSystem,
  type AccessConflict,
  type DependencyEdge,
  type SystemTiming,
  type CompiledSchedule,
} from "./execution_plan.js";

export { Time, createTime, MAX_DELTA, type TimeData } from "./time.js";

export { Transform, type TransformData } from "./transform.js";
export { PendingDespawn } from "./pending_despawn.js";

export { App, type AppRunner, type AppOptions } from "./app.js";
export type { Plugin, PluginFactory } from "./plugin.js";
export { normalizePlugin } from "./plugin.js";

export {
  workerSystem,
  getWorkerMeta,
  isWorkerSystem,
  runWorkerSystemLocal,
  type WorkerSystemDefinition,
  type WorkerSystemMeta,
  type WorkerDeclaredSystem,
} from "./parallel/worker_system.js";

export {
  parallelExecutor,
  ParallelExecutor,
  type ParallelExecutorOptions,
  type ParallelTimings,
} from "./parallel/executor.js";

export {
  createWorkerPool,
  workersSupported,
  type WorkerPool,
  type WorkerPoolOptions,
  type PoolMode,
} from "./parallel/pool.js";

export type {
  WorkerPayload,
  WorkerResult,
  WorkerWriteSlice,
  NumericSlice,
} from "./parallel/types.js";

export {
  isWorkerSafeComponent,
  getNumericLayout,
} from "./parallel/transfer.js";
