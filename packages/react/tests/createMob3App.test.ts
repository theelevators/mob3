import { describe, expect, it, afterEach, vi, beforeAll } from "vitest";
import { Transform } from "@mob3/core";
import { ThreeObject, ThreeScene } from "@mob3/three";
import * as THREE from "three";
import { createMob3App, destroyMob3App } from "../src/createMob3App.js";

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(Date.now()), 0) as unknown as number;
    };
  }
  if (typeof globalThis.cancelAnimationFrame !== "function") {
    globalThis.cancelAnimationFrame = (id: number) => {
      clearTimeout(id);
    };
  }
});

function mockRenderer(): THREE.WebGLRenderer {
  return {
    setClearColor: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  } as unknown as THREE.WebGLRenderer;
}

describe("createMob3App lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, runs setup, and disposes cleanly", () => {
    const canvas = { clientWidth: 640, clientHeight: 360 } as HTMLCanvasElement;
    let setupCalls = 0;
    let cleanupCalls = 0;

    const handle = createMob3App(canvas, {
      three: {
        syncMode: "always",
        autoResize: false,
        renderer: mockRenderer(),
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      },
      requestResizeOnMount: false,
      run: false,
      setup(app) {
        setupCalls++;
        const scene = app.world.resource(ThreeScene);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshBasicMaterial(),
        );
        scene.add(mesh);
        app.world.spawn(Transform(), ThreeObject(mesh));
        return () => {
          cleanupCalls++;
        };
      },
    });

    expect(setupCalls).toBe(1);
    expect(handle.app.isDisposed).toBe(false);
    expect([...handle.app.world.query(ThreeObject)].length).toBe(1);

    destroyMob3App(handle);
    expect(cleanupCalls).toBe(1);
    expect(handle.app.isDisposed).toBe(true);

    destroyMob3App(handle);
    expect(cleanupCalls).toBe(1);
  });

  it("Strict Mode double-create then dispose does not throw", () => {
    const canvas = { clientWidth: 1, clientHeight: 1 } as HTMLCanvasElement;
    const a = createMob3App(canvas, {
      three: {
        autoResize: false,
        renderer: mockRenderer(),
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      },
      requestResizeOnMount: false,
      run: false,
    });
    const b = createMob3App(canvas, {
      three: {
        autoResize: false,
        renderer: mockRenderer(),
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      },
      requestResizeOnMount: false,
      run: false,
    });
    destroyMob3App(a);
    destroyMob3App(b);
    expect(a.app.isDisposed).toBe(true);
    expect(b.app.isDisposed).toBe(true);
  });

  it("throws when three is enabled without a canvas", () => {
    expect(() =>
      createMob3App(null, { three: true, run: false }),
    ).toThrow(/canvas is required/);
  });

  it("can skip three for headless apps", () => {
    const handle = createMob3App(null, {
      three: false,
      run: false,
      setup(app) {
        app.world.spawn(Transform());
      },
    });
    expect([...handle.app.world.query(Transform)].length).toBe(1);
    destroyMob3App(handle);
  });
});
