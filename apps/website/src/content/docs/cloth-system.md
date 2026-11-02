---
title: ClothSystem
lead: 'The solver for a scene: it steps every cloth at a fixed rate and holds the results, the statistics and the quality controller.'
section: reference
order: 4
kind: reference
module: smooth-physics
example: banner-field
tags:
  [
    ClothSystem,
    create,
    options,
    update,
    pose,
    setPrecision,
    setFrequency,
    reset,
    addForce,
    simulations,
    SimulatedCloth,
    output,
    stats,
    quality,
    autoRate,
    onQualityChange,
    timeScale,
  ]
features: [performance]
---

```ts
class ClothSystem {
  static create(input: { scene: ClothScene; options?: SystemOptions }): ClothSystem;
}
```

Poses, forces and results are in the scene's coordinates. With three.js, `createThreeCloth` creates the system for you: it is `cloth.system`.

## ClothSystem.create

```ts
const system = ClothSystem.create({ scene, options: { frequency: 90, maxStepsPerFrame: 3 } });
```

| Option             | Type                              | Default | Description                                                     |
| ------------------ | --------------------------------- | ------- | --------------------------------------------------------------- |
| `frequency`        | `number`, 30 to 150               | `90`    | Solver steps per second.                                        |
| `maxStepsPerFrame` | integer, 1 to 5                   | `3`     | Steps a frame may run to catch up. Steps beyond it are dropped. |
| `include`          | `(cloth: ClothRecord) => boolean` | all     | Picks which cloths of the scene to build.                       |
| `debug`            | `boolean`                         | `false` | Logs quality changes to the console.                            |

Throws a `SmoothPhysicsError` with code `INVALID_OPTIONS` for an unknown option or a value out of range. Cloths with `enabled: false` are never built.

## update

```ts
system.update(input: { frameDeltaTime: number; pose: PoseSource }): void;
```

| Parameter        | Type         | Description                                                 |
| ---------------- | ------------ | ----------------------------------------------------------- |
| `frameDeltaTime` | `number`     | Seconds since the last update.                              |
| `pose`           | `PoseSource` | Returns the world pose of a transform after your animation. |

The system adds `frameDeltaTime` to its clock and runs as many steps of `1 / frequency` seconds as are due, up to `maxStepsPerFrame`. A frame that adds no time runs no steps.

### Pose and PoseSource

```ts
type PoseSource = (transformId: number) => Pose;
type Pose = {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number, number];
  readonly scale: [number, number, number];
  readonly matrix: number[];
};
```

- `matrix` is the world matrix: 16 numbers in column-major order, with the translation at indexes 12 to 14.
- `rotation` must be a unit quaternion. The pose is read as given, in the scene's coordinates.
- `pose` is called for the anchor, every transform of each cloth, and every collider's transform.
- A pose source may return the same arrays every frame, written in place. What the library keeps, it copies.

## Methods

| Method                        | Description                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `setFrequency(hz)`            | Changes the rate while it runs, clamped to 30 to 150 Hz.                                      |
| `setPrecision(precision)`     | `'default'` (64-bit, the fastest) or `'rounded'` (32-bit, repeats recorded runs bit for bit). |
| `reset()`                     | Starts every cloth again from its animated pose at the next update.                           |
| `addForce(input)`             | Pushes every cloth. See [ForceInput](#forceinput).                                            |
| `onQualityChange(listener)`   | Calls `listener` when the quality level changes. Returns a function that stops it.            |
| `requestMotionBoost(holdMs?)` | Asks the quality controller for a motion boost for `holdMs` milliseconds.                     |

### ForceInput

```ts
system.addForce({ force: [2, 0, -6], mode: 'add', uniform: false });
```

| Field     | Type             | Default  | Description                                                               |
| --------- | ---------------- | -------- | ------------------------------------------------------------------------- |
| `force`   | `Triple`         | required | Acceleration in m/s², in the scene's coordinates.                         |
| `mode`    | `'add' \| 'set'` | `'add'`  | `'add'` adds to the particles' velocity; `'set'` replaces it.             |
| `uniform` | `boolean`        | `false`  | `false` pushes particles near the roots less; `true` pushes all the same. |

The force acts during the steps of the next update that runs steps, then clears. Call it every frame for a steady force. A second call before that update replaces the first.

## Properties

| Property           | Type                     | Description                                                                |
| ------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `simulations`      | `SimulatedCloth[]`       | One per built cloth, in scene order.                                       |
| `stats`            | object                   | The last update: `frameMs`, `steps`, `particles`, `contacts`, `resets`.    |
| `quality`          | `Quality`                | The current quality level and setting. Read only.                          |
| `autoRate`         | `AutoRate`               | The quality controller's settings. See [Performance](../performance/).     |
| `frequency`        | `number`                 | The current rate in Hz. Change it with `setFrequency`.                     |
| `precision`        | `'default' \| 'rounded'` | The current precision. Change it with `setPrecision`.                      |
| `maxStepsPerFrame` | `number`                 | The current step limit. The quality controller may lower it.               |
| `timeScale`        | `number`                 | Multiplies the time each update adds. `1` by default; `0.5` is half speed. |
| `motionBoosted`    | `boolean`                | True while a motion boost holds the rate up.                               |

`stats.frameMs` is the physics time of the last update in milliseconds, `steps` the steps it ran, `particles` the particles of every cloth, and `contacts` the collider contacts. `resets` counts the times a cloth's state became non-finite and the cloth was reset; each one also logs a warning.

## Quality and AutoRate

```ts
type Quality = {
  readonly level: 'full' | 'reduced' | 'minimum';
  readonly frequency: number;
  readonly precision: 'default' | 'rounded';
  readonly maxSteps: number;
  readonly physicsMs: number;
  readonly frameCap30: boolean;
};
type QualityChange = Quality & {
  readonly previous: 'full' | 'reduced' | 'minimum';
  readonly reason: 'start' | 'motion' | 'slow-steps' | 'over-budget' | 'recovered';
};
```

`physicsMs` is the controller's running average of physics time per frame. `frameCap30` is true when frames arrive at a steady 30 fps, as in iOS Low Power Mode.

| `autoRate` field | Default                                                     | Description                                                     |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `enabled`        | `false`                                                     | Turns the quality controller on.                                |
| `budgetMs`       | `6`                                                         | The physics time per frame to stay under, in milliseconds.      |
| `precision`      | `false`                                                     | Lets it switch `'rounded'` to `'default'` while steps are slow. |
| `slowStepMs`     | `4`                                                         | A `'rounded'` step slower than this counts as slow.             |
| `rates`          | `[150, 120, 90, 60, 45, 30]`                                | The rates it may choose, highest first.                         |
| `maxFrequency`   | the starting rate                                           | It never raises the rate above this.                            |
| `maxSteps`       | the starting `maxStepsPerFrame`                             | It never raises the steps above this.                           |
| `motionBoost`    | `{ mode: 'off', frequency: 60, speed: 0.35, holdMs: 1000 }` | Holds a minimum rate while colliders move fast.                 |

## SimulatedCloth

One cloth in a running system, from `system.simulations` or `cloth.simulations`.

| Member            | Type                          | Description                                                                     |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `name`            | `string`                      | The cloth's name from its spec.                                                 |
| `particleCount`   | `number`                      | Particles in the cloth.                                                         |
| `settings`        | `ClothSettings`               | The resolved settings in the scene's coordinates. Change them with `tuneCloth`. |
| `enabled`         | `boolean`                     | `false` skips the cloth in `update`. Call `reset()` when you turn it back on.   |
| `output`          | `ClothOutput`                 | The results of the last update.                                                 |
| `stats`           | `{ steps, contacts, resets }` | This cloth's part of the system's statistics.                                   |
| `reset()`         | method                        | Starts this cloth again from its animated pose at the next update.              |
| `addForce(input)` | method                        | Pushes this cloth only.                                                         |

### ClothOutput

| Field            | Type                  | Description                                                   |
| ---------------- | --------------------- | ------------------------------------------------------------- |
| `positions`      | `readonly Triple[]`   | World position of each particle.                              |
| `rotations`      | `readonly Rotation[]` | World rotation of each particle's bone.                       |
| `localPositions` | `readonly Triple[]`   | Position relative to the parent bone.                         |
| `localRotations` | `readonly Rotation[]` | Rotation relative to the parent bone.                         |
| `localValid`     | `Uint8Array`          | `1` where particle `i` has a local pose: the bones that move. |

- Particles are in the cloth's own order. `simulation.mesh.transformIds[i]` is the transform id of particle `i`.
- Values are in the scene's coordinates, converted when first read after an update.
- The arrays are reused: each update writes new values into them. Copy a value to keep it.
