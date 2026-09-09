export type { Entity } from "./entity.js";
export { INVALID_ENTITY } from "./entity.js";

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
} from "./schedule.js";

export { Time, createTime, MAX_DELTA, type TimeData } from "./time.js";

export { App, type AppRunner } from "./app.js";
export type { Plugin, PluginFactory } from "./plugin.js";
