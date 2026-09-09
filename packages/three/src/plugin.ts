import type { World } from "mob3";
import { PreRender, Render, Transform } from "mob3";
import type { App, Plugin } from "mob3";
import * as THREE from "three";
import {
  ThreeCamera,
  ThreeObject,
  ThreeRenderer,
  ThreeScene,
  type ThreePluginOptions,
} from "./components.js";

function syncTransforms(world: World): void {
  for (const [, transform, three] of world.query(Transform, ThreeObject)) {
    const obj = three.object;
    obj.position.set(transform.x, transform.y, transform.z);
    obj.rotation.set(transform.rx, transform.ry, transform.rz);
    obj.scale.set(transform.sx, transform.sy, transform.sz);
  }
}

function renderFrame(world: World): void {
  const renderer = world.resource(ThreeRenderer);
  const scene = world.resource(ThreeScene);
  const camera = world.resource(ThreeCamera);
  renderer.render(scene, camera);
}

/**
 * Thin Three.js integration. Creates renderer/scene/camera resources
 * and registers transform sync + render systems.
 */
export function ThreePlugin(options: ThreePluginOptions = {}): Plugin {
  return {
    build(app: App) {
      const {
        canvas,
        antialias = true,
        createDefaultCamera = true,
        clearColor = 0x111111,
        autoResize = true,
      } = options;

      const renderer =
        options.renderer ??
        new THREE.WebGLRenderer({
          canvas,
          antialias,
        });
      renderer.setClearColor(clearColor);
      renderer.setPixelRatio(
        typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
      );

      const scene = options.scene ?? new THREE.Scene();

      let camera = options.camera;
      if (!camera && createDefaultCamera) {
        const aspect =
          canvas && canvas.clientWidth > 0
            ? canvas.clientWidth / Math.max(canvas.clientHeight, 1)
            : 16 / 9;
        camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        camera.position.set(0, 18, 22);
        camera.lookAt(0, 0, 0);
      }
      if (!camera) {
        throw new Error(
          "ThreePlugin: provide camera or leave createDefaultCamera enabled",
        );
      }

      if (autoResize && typeof window !== "undefined") {
        const resize = () => {
          const target = renderer.domElement;
          const width = target.clientWidth || window.innerWidth;
          const height = target.clientHeight || window.innerHeight;
          renderer.setSize(width, height, false);
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.aspect = width / Math.max(height, 1);
            camera.updateProjectionMatrix();
          }
        };
        resize();
        window.addEventListener("resize", resize);
      }

      app.insertResource(ThreeRenderer, renderer);
      app.insertResource(ThreeScene, scene);
      app.insertResource(ThreeCamera, camera);

      app.addSystem(PreRender, syncTransforms);
      app.addSystem(Render, renderFrame);
    },
  };
}

export { syncTransforms, renderFrame };
