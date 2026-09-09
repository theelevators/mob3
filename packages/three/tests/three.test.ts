import { describe, expect, it, vi } from "vitest";
import { App, Startup, PreRender } from "mob3";
import * as THREE from "three";
import {
  ThreePlugin,
  Transform,
  ThreeObject,
  ThreeScene,
  syncTransforms,
} from "../src/index.js";

describe("@mob3/three", () => {
  it("inserts scene/renderer/camera resources", () => {
    const renderer = {
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      domElement: { clientWidth: 800, clientHeight: 600 },
    } as unknown as THREE.WebGLRenderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const app = new App().addPlugin(
      ThreePlugin({
        renderer,
        scene,
        camera,
        autoResize: false,
      }),
    );

    expect(app.world.resource(ThreeScene)).toBe(scene);
  });

  it("syncs Transform → Object3D in PreRender", () => {
    const mesh = new THREE.Mesh();
    const app = new App()
      .addPlugin({
        build(a) {
          a.addSystem(PreRender, syncTransforms);
        },
      })
      .addSystem(Startup, (world) => {
        world.spawn(
          Transform({ x: 1, y: 2, z: 3, ry: 0.5, sx: 2, sy: 2, sz: 2 }),
          ThreeObject(mesh),
        );
      });

    app.update(1 / 60);

    expect(mesh.position.x).toBeCloseTo(1);
    expect(mesh.position.y).toBeCloseTo(2);
    expect(mesh.position.z).toBeCloseTo(3);
    expect(mesh.rotation.y).toBeCloseTo(0.5);
    expect(mesh.scale.x).toBeCloseTo(2);
  });
});
