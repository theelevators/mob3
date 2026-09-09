import { registerParallelFactory } from "../app.js";
import { parallelExecutor } from "./executor.js";

registerParallelFactory(parallelExecutor);
