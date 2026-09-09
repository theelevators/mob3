# BoxClub Migration Feedback — Real App Pressure Test

Honest take after shipping BoxClub onto mob3 (post Phase 11).

## Verdict

**Mixed — better structure, worse setup.**

mob3 beat R3F for a 60fps fight sim. It did **not** beat raw Three + a custom loop on total work — it beat it on ownership clarity.

## What got better

| Win | Why it mattered for BoxClub |
|-----|------------------------------|
| Clear ownership | Fighters / ring / FX / camera as entities + systems > R3F component soup |
| Match state sync | MatchBridge → systems cleaner than prop-drilling Three objects through React |
| Separation | React stays UI; the fight loop doesn’t fight React’s render cycle |
| Bundle size | Dumping R3F/drei: ~1.3MB → ~0.8MB |

## What hurt

| Pain | Class | Notes |
|------|-------|-------|
| Not on npm | **Install DX** | Had to vendor builds, fight `node:` imports, fix tsconfigs/symlinks |
| Still writing Three | **Architecture (intentional)** | Meshes, materials, arm pivots are raw Three. mob3 organizes; it doesn’t remove that work |
| Typing friction | **API DX** | `spawn` branding / casts; duplicate `@types/three` |
| Animation logic moved, didn’t shrink | **Expectation** | Punch choreography is the same code — now in a system instead of `useFrame` |

## Positioning (validated)

```
R3F for a 60fps sim     → awkward (React owning the loop)
mob3 for that sim       → better fit than R3F
raw Three + own loop    → mob3 = nicer structure, not less work
```

## Exit question for the next DX slice

> Can a Vite + React app depend on `mob3` / `@mob3/three` from a browser-safe entry and spawn typed entities without `as never` or `node:` stubs?

If no, BoxClub’s “worse setup” note still stands for the next adopter.
