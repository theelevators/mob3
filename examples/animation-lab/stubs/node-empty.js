// Browser stub for Node built-ins pulled via mob3 worker paths.
export const createRequire = () => () => ({});
export const fileURLToPath = (url) => String(url);
export const pathToFileURL = (p) => ({ href: String(p) });
export const readFile = async () => {
  throw new Error("node:fs unavailable in browser");
};
export const cpus = () => [];
export const Worker = undefined;
export const parentPort = null;
export default {};
