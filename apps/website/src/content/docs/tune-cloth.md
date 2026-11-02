---
title: tuneCloth
lead: Changes the settings of a running cloth without resetting its particles.
section: reference
order: 6
kind: reference
module: smooth-physics
example: fabric-lab
tags: [tuneCloth, live tuning, settings, patch, slider, retune, running cloth]
features: [tuning]
---

```ts
function tuneCloth(input: { simulation: SimulatedCloth; settings: ClothSettingsInput }): void;
```

| Parameter    | Type                 | Description                                                            |
| ------------ | -------------------- | ---------------------------------------------------------------------- |
| `simulation` | `SimulatedCloth`     | The cloth to change, from `system.simulations` or `cloth.simulations`. |
| `settings`   | `ClothSettingsInput` | The settings to change. Everything else keeps its current value.       |

```ts
import { tuneCloth } from 'smooth-physics';

const [simulation] = cloth.simulations;
tuneCloth({ simulation, settings: { gravity: 2, damping: 0.1 } });
```

## Behaviour

- The particles keep their positions and velocities, so the cloth moves on without a jump.
- What `settings` leaves out keeps its current value, not its default.
- A group you turn on takes its current values, or `ENABLED_DEFAULTS` if it was off. `{ enabled: false }` turns it off.
- Every setting can change, including `bendingStiffness` to and from 0 and `gravityDirection`.
- Defaults that point somewhere follow the scene's up axis, as they do when the cloth is built.
- `simulation.settings` holds the result.

## Errors

An unknown setting or a value out of range throws a `SmoothPhysicsError` with code `INVALID_CLOTH_SPEC`, and the cloth keeps its settings. The message starts with the cloth's name:

```text
chain settings: Unrecognized key: "gravty"
```

## What it does not change

`tuneCloth` changes settings only. The roots, anchor, connection, colliders and rest pose are fixed when the cloth is built; to change them, build the cloth again.

See [Live tuning](../live-tuning/) for wiring settings to sliders.
