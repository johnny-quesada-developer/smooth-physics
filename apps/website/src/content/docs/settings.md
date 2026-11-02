---
title: Settings
lead: Settings are given per cloth, checked once, and merged over the defaults; a value can change from the root to the tip.
section: concepts
order: 4
kind: concept
example: ribbon-baton
tags: [settings, gravity, damping, stiffness, restoration, angle limit, max distance, behind limit, range, curve, keys, enabled, groups, defaults]
features: [gravity, restoration, limits, inertia]
---

Each cloth takes a `settings` object. What you leave out takes its value from `DEFAULT_SETTINGS`. Unknown names are refused, so a typo such as `dampng: 0.1` throws instead of doing nothing.

```ts
settings: {
  gravity: 9.8,
  damping: [0.05, 0.2],
  stiffness: [1, 0.5],
  restoration: { stiffness: [0.2, 0.04] },
  angleLimit: { degrees: [0, 50] },
  maxDistance: { distance: 0.3 },
}
```

## Ranges

Many settings are ranges: they can take a different value at each depth of the chain.

| Written as        | Means                                     |
| ----------------- | ----------------------------------------- |
| `0.1`             | The same value along the whole chain.     |
| `[0.05, 0.2]`     | A straight line from the root to the tip. |
| `{ scale, keys }` | A curve.                                  |

Most cloth wants a stiff, calm root and a looser tip, so pairs such as `stiffness: [1, 0.5]` are common.

## Curves

A curve has `keys` and an optional `scale` that multiplies every value. Each key has a `time` from 0 (the root) to 1 (the tip), a `value`, an `inSlope` and an `outSlope`. A slope of `'step'` holds the value until the next key. Key times must increase.

```ts
radius: {
  scale: 0.02,
  keys: [
    { time: 0, value: 1, inSlope: 0, outSlope: 'step' },
    { time: 0.5, value: 0.5, inSlope: 0, outSlope: 0 },
    { time: 1, value: 0.8, inSlope: 0, outSlope: 0 },
  ],
}
```

This radius is 0.02 m up to the middle of the chain, then 0.01 m, rising to 0.016 m at the tip.

## Groups that switch on and off

`restoration`, `angleLimit`, `maxDistance` and `behindLimit` are groups. A group that is off is written `{ enabled: false }` and takes no other values, so a setting that would do nothing cannot be written. Any other value turns it on, and what you leave out takes its value from `ENABLED_DEFAULTS`.

```ts
angleLimit: { degrees: [0, 50] }, // on, with stiffness 1 from ENABLED_DEFAULTS
behindLimit: { enabled: false }, // off
maxDistance: { distance: 0.3 }, // on; a maximum distance has no default, so it needs one
```

`collision` and `inertia.teleport` switch with a `mode` instead: `{ mode: 'off' }` takes no other values.

```ts
collision: { mode: 'off' },
inertia: { teleport: { mode: 'reset', distance: 0.5 } },
```

## The main settings

| Setting                       | Default                             | What it does                                                                      |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `gravity`, `gravityDirection` | `5`, down the up axis               | Acceleration in m/s², and its direction.                                          |
| `damping`                     | `0.05`                              | Velocity lost every step, 0 to 1 (range).                                         |
| `radius`                      | `0.02`                              | Particle radius for collisions, in metres (range).                                |
| `stiffness`                   | `[1, 0.5]`                          | How strongly links keep their rest length, 0 to 1 (range).                        |
| `bendingStiffness`            | `1`                                 | How strongly a surface keeps its shape across its triangles, 0 to 1.              |
| `restoration`                 | on, stiffness `[0.2, 0.04]`         | Pull back toward the animated pose (group).                                       |
| `angleLimit`                  | off; on: `[0, 60]` degrees          | Maximum bend away from the animated pose (group).                                 |
| `maxDistance`                 | off; on needs a `distance`          | How far a particle may move from its animated position, in metres (group).        |
| `behindLimit`                 | off; on: radius `10`, distance `0`  | Keeps particles in front of their bones; `axis` is the bone axis that points out. |
| `inertia`                     | `world: 1`, `local: 1`              | How much of its motion the cloth keeps; 0 follows rigidly.                        |
| `collision`                   | `{ mode: 'point', friction: 0.05 }` | `'off'`, `'point'` or `'edge'` against the cloth's colliders.                     |
| `animationBlend`              | `0`                                 | 0 keeps the cloth's rest shape, 1 follows the animated shape.                     |
| `settleTime`                  | `0.1`                               | Seconds over which the simulation fades in after a start or reset.                |

[Settings reference](../settings-reference/) lists every setting with its type, range and default, including the inertia and speed-limit values and the rarer settings.

## Directions follow the up axis

Defaults that point somewhere follow the scene's up axis. With Z up, gravity pulls along `[0, 0, -1]` and the behind limit uses the bone's Z axis. See [Coordinates and engines](../coordinates/).

## Checking settings without a cloth

`resolveSettings` returns the full settings an input resolves to, or throws the same error a cloth would.

```ts
import { resolveSettings } from 'smooth-physics';

const settings = resolveSettings({ settings: { damping: [0.05, 0.2] }, name: 'hair' });
settings.angleLimit; // { enabled: false }
```

## Changing settings while it runs

`tuneCloth` changes a running cloth without restarting its motion. See [Live tuning](../live-tuning/).
