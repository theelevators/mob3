# Phase 11 Design — Animation & Instance Runtime

## Question

> Can animated GLTF instances participate while ECS owns world/root state and Three owns renderer-local pose?

## 1. Animated instance ownership

- Asset holds shared geometry/materials/textures/**AnimationClip** definitions
- Instance holds **AnimationMixer**, actions, playback time, skeleton clone
- `SkeletonUtils.clone(scene)` for skinned/animated roots (not shallow `clone(false)`)

## 2–4. Skeleton / clips / mixer

- Skeleton stays Three-local — **no ECS entity per bone**
- Clips shared from asset; actions/mixers per instance
- Runtime map: `entity → { mixer, actions, rootObject3D, boneIndex }`

## 5. Animation state (ECS)

```ts
AnimationPlayer {
  clip: string      // logical name on source asset
  playing: boolean
  speed: number
  loop: boolean     // true = LoopRepeat, false = LoopOnce
  time: number      // inspect / seek (seconds)
  fadeDuration: number // next play/crossfade duration
}
```

Imperative helpers: `playAnimation`, `pauseAnimation`, `stopAnimation`, `crossfadeAnimation`.

No raw `AnimationAction` in gameplay components.

## 6. Clock

**Update delta** (visual). Not FixedUpdate — animation is visual/runtime state.  
Gameplay-critical timing uses `AnimationFinished` events, not frame timing.

## 7. Crossfade

`crossfadeAnimation(entity, clip, duration)` → `fadeOut` current + `fadeIn` target.  
Interrupted fades do **not** emit Finished for the interrupted clip.  
Missing clip → clear error listing available names.

## 8. Events

Mixer `finished` / `loop` → enqueue → `animationEventFlush` system → `AnimationFinished` / `AnimationLooped`.  
Stale entity generation ignored. No direct gameplay from Three callbacks.

## 9. BoneAttachment

```ts
BoneAttachment { source, bone, ox,oy,oz, orx,ory,orz }
```

Samples bone world matrix after mixer update; writes attached entity `GlobalTransform` (and marks changed).  
Conflicts with Parent: attachment **wins** for GlobalTransform; document restriction (prefer roots or no Parent).  
Source despawn → detach (clear component / leave as free root).

## 10. Root motion

**Unsupported for v0.1.**  
Instance mixer roots are driven by ECS GlobalTransform sync only.  
Clip tracks that target the scene root translation are ignored/stripped on instance bind (instance-local derived clips, not mutating shared asset clips).

## 11–12. Disposal / unload

Despawn: stop actions, uncache mixer, drop callbacks, clear attachments, release asset retain.  
Unload blocked while instances retain (Phase 10). App.dispose cleans all runtimes.

## Schedule

```
Update:     animationIntent → animationMixerUpdate → animationEventFlush
PostUpdate: transformPropagation → boneAttachmentSample
PreRender:  syncTransforms (entity roots only; bones stay Three-local)
```
