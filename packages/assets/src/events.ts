import { event } from "@mob3/core";
import type { AssetFailedEvent, AssetReadyEvent } from "./types.js";

export const AssetReady = event<AssetReadyEvent>("AssetReady");
export const AssetFailed = event<AssetFailedEvent>("AssetFailed");
