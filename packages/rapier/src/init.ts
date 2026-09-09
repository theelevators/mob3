import RAPIER from "@dimforge/rapier3d-compat";

let ready = false;
let initPromise: Promise<void> | null = null;

/** Initialize Rapier WASM/compat runtime. Call once before adding RapierPlugin. */
export async function initRapier(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => {
      ready = true;
    });
  }
  await initPromise;
}

export function isRapierReady(): boolean {
  return ready;
}

export { RAPIER };
