---
title: Settings reference
nav: Settings
lead: Every cloth setting with its type, range and default, and the functions and constants that hold them.
section: reference
order: 3
kind: reference
module: smooth-physics
tags:
  [
    settings,
    ClothSettingsInput,
    ClothSettings,
    resolveSettings,
    DEFAULT_SETTINGS,
    ENABLED_DEFAULTS,
    defaults,
    range,
    inertia,
    restoration,
    angleLimit,
    maxDistance,
    behindLimit,
    collision,
    teleport,
  ]
features: [gravity, restoration, limits, inertia, teleport]
---

A cloth's `settings` is a `ClothSettingsInput`: every field is optional. What you leave out takes its default. Unknown fields and values out of range throw a `SmoothPhysicsError` with code `INVALID_CLOTH_SPEC`. How ranges, curves and groups work is explained in [Settings](../settings/).

## ClothSettingsInput

| Setting              | Type               | Default                             | Description                                                                                             |
| -------------------- | ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `gravity`            | `number`, ≥ 0      | `5`                                 | Acceleration in m/s².                                                                                   |
| `gravityDirection`   | `Triple`, not zero | `[0, -1, 0]`; Z up: `[0, 0, -1]`    | Direction of gravity.                                                                                   |
| `gravityFalloff`     | `number`, 0 to 1   | `0`                                 | Weakens gravity while the cloth hangs the way it did at rest.                                           |
| `damping`            | `Range`, 0 to 1    | `0.05`                              | Velocity lost every step.                                                                               |
| `radius`             | `Range`, ≥ 0       | `0.02`                              | Particle radius for collisions, in metres.                                                              |
| `stiffness`          | `Range`, 0 to 1    | `[1, 0.5]`                          | How strongly links keep their rest length.                                                              |
| `compressionLimit`   | `number`, 0 to 1   | `0.4`                               | How far a particle may move toward its root, as a share of its rest distance, before it is pushed back. |
| `bendingStiffness`   | `number`, 0 to 1   | `1`                                 | How strongly a surface keeps its shape across its triangles.                                            |
| `restoration`        | group              | on                                  | Pull back toward the animated pose. See below.                                                          |
| `angleLimit`         | group              | off                                 | Maximum bend away from the animated pose. See below.                                                    |
| `maxDistance`        | group              | off                                 | Maximum distance from the animated position. See below.                                                 |
| `behindLimit`        | group              | off                                 | Keeps particles in front of their bones. See below.                                                     |
| `motionStiffness`    | `number`, 0 to 1   | `1`                                 | How firmly `maxDistance` and `behindLimit` hold.                                                        |
| `inertia`            | object             | see below                           | How much of the anchor's motion the cloth feels.                                                        |
| `collision`          | `CollisionInput`   | `{ mode: 'point', friction: 0.05 }` | Contact with the cloth's colliders. See below.                                                          |
| `influence`          | `number`, 0 to 1   | `1`                                 | How much of the simulated result shows over the animated pose.                                          |
| `settleTime`         | `number`, ≥ 0      | `0.1`                               | Seconds over which the simulation fades in after a start or reset.                                      |
| `rotationFollow`     | `number`, 0 to 1   | `0.5`                               | How far a moving bone turns toward where its children moved.                                            |
| `rootRotationFollow` | `number`, 0 to 1   | `0.5`                               | The same for fixed bones.                                                                               |
| `animationBlend`     | `number`, 0 to 1   | `0`                                 | 0 keeps the cloth's rest shape, 1 follows the animated shape.                                           |

`Range` is `number | readonly [root: number, tip: number] | CurveSpec`. For a curve, only its keys are checked against the range.

## restoration

On by default. Write `{ enabled: false }` to turn it off.

| Field             | Type             | Default       | Description                                                                                  |
| ----------------- | ---------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `stiffness`       | `Range`, 0 to 1  | `[0.2, 0.04]` | How strongly each link bends back toward its animated angle.                                 |
| `velocityDamping` | `number`, 0 to 1 | `0.8`         | Share of each restoring move that adds no velocity. Lower values make restoration springier. |
| `gravityFalloff`  | `number`, 0 to 1 | `0`           | Weakens restoration as the cloth turns away from the way it hung at rest.                    |

## angleLimit

Off by default. Any value other than `{ enabled: false }` turns it on.

| Field       | Type              | Default   | Description                               |
| ----------- | ----------------- | --------- | ----------------------------------------- |
| `degrees`   | `Range`, 0 to 180 | `[0, 60]` | Maximum bend away from the animated pose. |
| `stiffness` | `number`, 0 to 1  | `1`       | How firmly the limit holds.               |

## maxDistance

Off by default. A maximum distance has no default, so turning it on needs one.

| Field      | Type         | Default  | Description                                                        |
| ---------- | ------------ | -------- | ------------------------------------------------------------------ |
| `distance` | `Range`, ≥ 0 | required | How far a particle may move from its animated position, in metres. |

## behindLimit

Off by default. Any value other than `{ enabled: false }` turns it on.

| Field      | Type          | Default            | Description                                                                                                            |
| ---------- | ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `radius`   | `number`, ≥ 0 | `10`               | Radius of the sphere behind each particle that pushes it back out, in metres. A large radius acts almost like a plane. |
| `distance` | `Range`, ≥ 0  | `0`                | How far behind the animated position that sphere begins, in metres.                                                    |
| `axis`     | `BoneAxis`    | `'y'`; Z up: `'z'` | The bone axis that points out: `'x'`, `'y'`, `'z'`, `'-x'`, `'-y'` or `'-z'`.                                          |

## collision

`CollisionInput` is `{ mode: 'off' }` or `{ mode?: 'point' | 'edge'; friction?: number }`.

| Field      | Type                         | Default   | Description                                                            |
| ---------- | ---------------------------- | --------- | ---------------------------------------------------------------------- |
| `mode`     | `'off' \| 'point' \| 'edge'` | `'point'` | `'point'` tests particles; `'edge'` also tests the edges between them. |
| `friction` | `number`, 0 to 1             | `0.05`    | Slows particles that slide over a collider. Not allowed with `'off'`.  |

## inertia

| Field                     | Type              | Default           | Description                                                          |
| ------------------------- | ----------------- | ----------------- | -------------------------------------------------------------------- |
| `world`                   | `number`, 0 to 1  | `1`               | How much of the anchor's movement through the world the cloth feels. |
| `local`                   | `number`, 0 to 1  | `1`               | The same for the motion of the cloth's fixed bones.                  |
| `smoothing`               | `number`, 0 to 1  | `0.2`             | Smooths the anchor's velocity before the cloth feels it.             |
| `rootFollow`              | `number`, 0 to 1  | `0`               | Lets particles near the root follow the anchor more closely.         |
| `centrifugal`             | `number`, 0 to 1  | `0`               | Pushes particles outward while the cloth spins.                      |
| `movementSpeedLimit`      | `SpeedLimit`, m/s | `5`               | Anchor movement above this carries the cloth along.                  |
| `rotationSpeedLimit`      | `SpeedLimit`, °/s | `720`             | Anchor rotation above this carries the cloth along.                  |
| `localMovementSpeedLimit` | `SpeedLimit`, m/s | `'off'`           | The same for local movement.                                         |
| `localRotationSpeedLimit` | `SpeedLimit`, °/s | `'off'`           | The same for local rotation.                                         |
| `particleSpeedLimit`      | `SpeedLimit`, m/s | `4`               | The highest speed of any particle.                                   |
| `anchor`                  | `number`, 0 to 1  | `0`               | Accepted and validated; the current solver does not read it.         |
| `teleport`                | `TeleportInput`   | `{ mode: 'off' }` | What happens when the anchor jumps.                                  |

`SpeedLimit` is a number of at least 0, or `'off'`.

`TeleportInput` is `{ mode: 'off' }` or:

| Field      | Type                | Default  | Description                                                              |
| ---------- | ------------------- | -------- | ------------------------------------------------------------------------ |
| `mode`     | `'reset' \| 'keep'` | required | `'reset'` restarts the cloth in place; `'keep'` carries its shape along. |
| `distance` | `number`, ≥ 0       | `0.5`    | A move of at least this many metres in one frame is a jump.              |
| `rotation` | `number`, 0 to 360  | `90`     | A turn of at least this many degrees in one frame is a jump.             |

## resolveSettings

```ts
function resolveSettings(input: { settings?: ClothSettingsInput; name?: string; up?: 'y' | 'z' }): ClothSettings;
```

Returns the full settings an input resolves to, with every default filled in.

| Parameter  | Type                 | Default   | Description                                         |
| ---------- | -------------------- | --------- | --------------------------------------------------- |
| `settings` | `ClothSettingsInput` | `{}`      | The input to resolve.                               |
| `name`     | `string`             | `'cloth'` | Starts error messages: `hair settings: damping: …`. |
| `up`       | `'y' \| 'z'`         | `'y'`     | The up axis that direction defaults follow.         |

```ts
import { resolveSettings } from 'smooth-physics';

const settings = resolveSettings({ settings: { angleLimit: { degrees: 45 } }, name: 'hair' });
settings.angleLimit; // { enabled: true, degrees: 45, stiffness: 1 }
```

## DEFAULT_SETTINGS and ENABLED_DEFAULTS

```ts
const DEFAULT_SETTINGS: ClothSettings;
const ENABLED_DEFAULTS: EnabledDefaults;
```

- `DEFAULT_SETTINGS` is every setting's default with Y up. A group that is off by default is `{ enabled: false }`.
- `ENABLED_DEFAULTS` holds the values a group takes when it is turned on without them: `restoration`, `angleLimit`, `behindLimit`, `collision` and `teleport`.

`ClothSettings` is the resolved shape: every field present, groups as `{ enabled: false }` or `{ enabled: true, ... }` with all their values.
