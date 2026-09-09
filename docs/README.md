# Architecture

See the product principles and phase plan in the repository root README and:

- [design.md](./design.md)
- [api-experiments.md](./api-experiments.md)

## Event lifetime

Events sent during `App.update()` are readable by systems later in that same update. They are cleared at the end of the update. Do not rely on events across frames.
