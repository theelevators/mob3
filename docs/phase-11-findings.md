# Phase 11 Findings — Animation & Instance Runtime

## Authority

| Owns | What |
|------|------|
| **ECS** | Entity identity, hierarchy, Transform / GlobalTransform, AnimationPlayer intent, BoneAttachment, lifecycle, events |
| **Three (`@mob3/three`)** | Skeleton, Bone objects, AnimationMixer / AnimationAction, sampled pose, skinning |

Bones are **not** ECS entities. Character A can Run while B Idles from one asset — proven.

## Animated instancing

- Static meshes: `scene.clone(true)`
- Skinned: `SkeletonUtils.clone` (`clone` from `three/examples/jsm/utils/SkeletonUtils.js`)
- Root Object3D local TRS zeroed; ECS Transform drives world placement via `syncTransforms`
- One asset → N independent mixers / skeletons

## Shared vs instance state

| Shared (asset) | Per instance |
|----------------|--------------|
| Geometry, materials, textures | Skeleton clone / Object3D tree |
| AnimationClip definitions (when unstripped) | AnimationMixer, AnimationAction, time/speed/blend |
| | Derived root-motion-stripped clips (only when tracks removed) |

## Playback API

Survived pressure testing:

- Component: `AnimationPlayer { clip, playing, speed, loop, time, fadeDuration }`
- Imperative: `playAnimation` / `pauseAnimation` / `resumeAnimation` / `stopAnimation` / `crossfadeAnimation`
- Clip identity: **asset-relative name string** (no global registry)
- Missing clip → immediate diagnostic listing available names

No AnimationAction in gameplay components.

## Clock

**Update delta** (visual). Not FixedUpdate.  
Gameplay-critical timing uses `AnimationFinished`, not frame timing.

## Crossfades

`fadeOut` current + `fadeIn` target via `fadeDuration`.  
Zero duration → hard switch (`stopAllAction` + play).  
Interrupted clips do **not** emit Finished.

## Events

```
Mixer finished/loop
  → AnimationRuntimeStore.pending
  → animationEventFlush (Update)
  → AnimationFinished / AnimationLooped
```

Generation-checked; despawned entities drop late callbacks. No direct gameplay from mixer callbacks.

## Root motion

**Unsupported (v0.1).**  
`stripRootMotion` removes root `.position` tracks into instance-local derived clips (shared asset clips untouched).  
ECS root Transform is never moved by animation.

## Bone attachments

```
BoneAttachment { source, bone, ox..orz }
```

After `transformPropagation` (PostUpdate):

`source.GlobalTransform × bone.matrixWorld × offset → attachment Transform/GlobalTransform`

Bone names resolved once at instantiate into a map. Source despawn → detach (remove component). No Parent + BoneAttachment dual-authority preferred.

## Performance

`npm run bench:animation` (procedural 3-clip character, no GPU render):

| n | attach | ms/frame (60-frame avg) | mixer ms/f | attach ms/f |
|---|--------|-------------------------|------------|-------------|
| 1 | N | ~0.02 | ~0.001 | — |
| 1 | Y | ~0.05 | ~0.001 | ~0.06 |
| 10 | N | ~0.04 | ~0.01 | — |
| 10 | Y | ~0.22 | ~0.01 | ~0.05 |
| 100 | N | ~0.10 | ~0.02 | — |
| 100 | Y | ~0.35 | ~0.01 | ~0.12 |
| 500 | N | ~0.28 | ~0.08 | — |
| 500 | Y | ~1.06 | ~0.08 | ~0.58 |

Geometry count stays **1** for N instances. Attachment sampling dominates at scale (matrix compose/decompose).

## Disposal

On instance teardown / `PendingDespawn` / `App.dispose`:

- stop actions, `uncacheRoot`, remove mixer listeners
- drop runtime map entry
- release asset retain (Phase 10)
- BoneAttachment cleared when source dies

No zombie mixers; no events after dispose.

## DX pain

- Clip names are strings (ambiguous if duplicates in one GLTF)
- BoneAttachment entities should be free roots (Parent conflicts)
- Procedural fixtures ≠ real SkinnedMesh GLTF (clone path still covered)
- `inspectAnimation` is separate from `world.inspect` (could merge later)

## Generalization

No `@mob3/animation` package.  
`AnimationPlayer` semantics look renderer-neutral, but mixer/skeleton/attachments are Three-specific. Extract only after another backend needs the same intent surface.

## Exit criteria answers

1. **Can A run while B idles from one asset?** Yes.
2. **Can a sword follow a hand without RightHand as an ECS entity?** Yes — `BoneAttachment`.
3. **Can completion reach gameplay without mixer→gameplay callbacks?** Yes — pending queue → flush system.
4. **Can bones animate without stealing ECS root Transform?** Yes — root motion stripped; root sync is one-way ECS→Three.
5. **Would another renderer-local animation runtime still fit?** Yes — intent/events/attachments stay in ECS; replace `AnimationRuntimeStore` internals.
