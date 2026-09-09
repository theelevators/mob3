import { resource, type World } from "mob3";

export type KeyCode = string;

/**
 * Frame-scoped keyboard/button state.
 *
 * - `pressed` — currently held
 * - `justPressed` / `justReleased` — edges since last clear
 *
 * Transients clear at end of each `App.update` (PostRender system).
 * With one FixedUpdate per frame (dt === fixedDelta) this matches simulation cadence.
 */
export type InputState = {
  pressed(code: KeyCode): boolean;
  justPressed(code: KeyCode): boolean;
  justReleased(code: KeyCode): boolean;
  /** Set held state (synthetic / adapters). */
  setPressed(code: KeyCode, down: boolean): void;
  /** Clear justPressed / justReleased. */
  clearTransients(): void;
  /** Snapshot of all currently pressed codes. */
  pressedCodes(): KeyCode[];
};

export const Input = resource<InputState>("Input");

export function createInputState(): InputState {
  const down = new Set<KeyCode>();
  const pressedEdge = new Set<KeyCode>();
  const releasedEdge = new Set<KeyCode>();

  return {
    pressed(code) {
      return down.has(code);
    },
    justPressed(code) {
      return pressedEdge.has(code);
    },
    justReleased(code) {
      return releasedEdge.has(code);
    },
    setPressed(code, isDown) {
      const was = down.has(code);
      if (isDown && !was) {
        down.add(code);
        pressedEdge.add(code);
        releasedEdge.delete(code);
      } else if (!isDown && was) {
        down.delete(code);
        releasedEdge.add(code);
        pressedEdge.delete(code);
      }
    },
    clearTransients() {
      pressedEdge.clear();
      releasedEdge.clear();
    },
    pressedCodes() {
      return [...down];
    },
  };
}

/** Apply a batch of synthetic key states (headless / tests). */
export function applyInput(
  world: World,
  edges: { code: KeyCode; down: boolean }[],
): void {
  const input = world.resource(Input);
  for (const e of edges) {
    input.setPressed(e.code, e.down);
  }
}

/** Convenience: set absolute pressed map for this frame's edges. */
export function setInputMap(
  world: World,
  map: Record<KeyCode, boolean>,
): void {
  const input = world.resource(Input);
  for (const [code, down] of Object.entries(map)) {
    input.setPressed(code, down);
  }
}
