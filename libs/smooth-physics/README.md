# smooth-physics

Secondary motion on bone chains for the web: hair, robes, capes, tails, ribbons, chains and curtains. Each bone below a
cloth's roots becomes a particle. Every frame the solver moves the particles and writes the result back to the bones.

- **Any 3D engine.** The core takes poses and returns poses, so it works with any engine, or none.
- **A ready-made three.js adapter.** `smooth-physics/three` connects it to a three.js model in one call and is optimized
  like the solver. It is a separate entry point, so apps without three.js never load it,
  and the three.js module is passed in by the caller.
- **Deterministic.** In one JavaScript engine on one processor architecture, the same input always gives the same
  output, bit for bit.
- **Fails loudly.** Every input is validated once, strictly. A call does what it was asked or throws a
  `SmoothPhysicsError`; nothing is ignored silently.
- **Any coordinates.** Left- or right-handed, Y or Z up. The conversion only moves and negates numbers, so it is exact.

## Install

```sh
npm install smooth-physics    # or: yarn add smooth-physics, pnpm add smooth-physics
```

The three.js adapter uses the `three` package your app already depends on.

## With three.js

```ts
import * as THREE from 'three';
import { createThreeCloth } from 'smooth-physics/three';

declare const model: THREE.Object3D, hairRoot: THREE.Object3D, head: THREE.Object3D, mixer: THREE.AnimationMixer;

const cloth = createThreeCloth({
  three: THREE,
  root: model,
  spec: {
    cloths: [{ name: 'hair', bones: [hairRoot], colliders: [0], settings: { radius: 0.015 } }],
    colliders: [{ object: head, shape: 'sphere', radius: 0.09 }],
  },
});

function frame(deltaTime: number): void {
  cloth.restore(); // before the animation mixer
  mixer.update(deltaTime);
  cloth.update({ deltaTime, root: model }); // after the mixer, before rendering
}
```

- `createThreeCloth`, `ThreeClothAdapter`, `THREE_COORDINATES` and the `ThreeClothSpec` and `ThreeColliderSpec`
  types come from `smooth-physics/three`; settings, errors, `tuneCloth` and the core come from `smooth-physics`.
- `bones` are the roots of the cloth. They stay fixed, and every object below them becomes a particle. Meshes, lines,
  points, sprites, lights and cameras are never particles.
- `anchor` is the object the cloth moves with. It defaults to `root`.
- `colliders` on a cloth lists the colliders it reacts to, by their index in `spec.colliders`.
- `restore()` puts back the bone poses the cloth overwrote, so the mixer animates from them.
- Positions, forces and collider offsets are in three.js world space (`THREE_COORDINATES`: right-handed, Y up).

The adapter also has `addForce`, `setEnabled(enabled)`, `setSimulationEnabled({ simulation, enabled })`,
`particles(simulation)` for the particle positions, and `system` for the `ClothSystem` it drives.

## Without three.js

Describe the transforms yourself, then pass a function that returns the world pose of each transform every frame.

```ts
import { ClothSystem, createClothScene, type Pose } from 'smooth-physics';

const scene = createClothScene({
  coordinates: { up: 'y', handedness: 'right' },
  transforms: [
    { id: 1, name: 'root' },
    { id: 2, name: 'chain0', parent: 1, position: [0, 1, 0] },
    { id: 3, name: 'chain1', parent: 2, position: [0, -0.1, 0] },
    { id: 4, name: 'chain2', parent: 3, position: [0, -0.1, 0] },
  ],
  cloths: [{ name: 'chain', roots: [2], anchor: 1, settings: { damping: [0.05, 0.2], gravity: 9.8 } }],
});

const system = ClothSystem.create({ scene });

declare const pose: (id: number) => Pose; // the world pose of a transform, after animation

system.update({ frameDeltaTime: 1 / 60, pose });

const [chain] = system.simulations;
chain?.output.localRotations; // write these back to the bones
```

- Distances are in metres. Rotations are quaternions `[x, y, z, w]`. Transform ids are positive integers.
- `output` gives `positions` and `rotations` in world space, and `localPositions` and `localRotations` relative to the
  parent bone. `localValid[i]` is 1 where particle `i` has a local pose. The arrays are reused every frame, so copy a
  value to keep it.
- `fixed` keeps more bones still and `exclude` leaves bones out of the cloth. A cloth has at most 4,096 particles.
- A cloth is built in the pose of its transforms. `restPose` builds it in another pose: one world pose for every cloth
  transform and the anchor, with unit quaternions.

The core does not touch the DOM or three.js, so it also runs in a Web Worker.

## Connections

`connection` decides which particles are joined.

| Connection         | Joins                                                        | Good for                                    |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| `chains` (default) | Each bone to its parent                                      | Chains, hair strands, ribbons, fringe       |
| `nearest`          | Neighbouring chains by distance, with triangles between them | Curtains, flags, capes                      |
| `strip`            | Chains in the order of the roots                             | Surfaces whose chains are not evenly spaced |
| `ring`             | Like `strip`, and the last chain to the first                | Robes and sleeves                           |

Surfaces bend with triangle constraints set by `bendingStiffness`. For closed rings such as robes,
`normals: 'outward'` points each particle's normal away from the cloth's centre instead of along its bone.

## Colliders

```ts
colliders: [
  { object: head, shape: 'sphere', radius: 0.09 },
  { object: thigh, shape: 'capsule', radius: 0.075, endRadius: 0.06, length: 0.42, center: [0, -0.21, 0] },
];
```

- A capsule lies along `axis` of its object (`'y'` by default). Its `length` is measured from tip to tip, end caps
  included. `align: 'start'` starts it at the object instead of centring it, and `endRadius` tapers it toward the far
  end.
- `center` offsets the shape in the object's local space.
- Without three.js, a collider names its transform with `transform`, and cloths list colliders by `id` (by default
  `'collider1'`, `'collider2'`, … in list order).
- `collision: { mode: 'edge' }` also tests the edges between particles, so a collider cannot slip between two chains.
  `'point'` (default) tests particles only and is cheaper. `friction` slows particles that slide over a collider.

## Settings

Settings are given per cloth. What you leave out takes its value from `DEFAULT_SETTINGS`, and unknown names are refused.

A **range** is a number (the same along the chain), `[root, tip]` (a straight line from root to tip) or a curve
`{ scale?, keys }`. Each key has a `time` from 0 (root) to 1 (tip), a `value`, an `inSlope` and an `outSlope`. A slope
of `'step'` holds the value until the next key, and `scale` multiplies every value.

A **group** that can be off is `{ enabled: false }` with no other values. Any other value turns it on, and the values
you leave out take `ENABLED_DEFAULTS`.

| Setting                       | Default                             | What it does                                                                      |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `gravity`, `gravityDirection` | `5`, down the up axis               | Acceleration in m/s² and its direction.                                           |
| `damping`                     | `0.05`                              | Velocity lost every step, 0 to 1 (range).                                         |
| `radius`                      | `0.02`                              | Particle radius for collisions, in metres (range).                                |
| `stiffness`                   | `[1, 0.5]`                          | How strongly links keep their rest length, 0 to 1 (range).                        |
| `bendingStiffness`            | `1`                                 | How strongly a surface keeps its shape between triangles.                         |
| `restoration`                 | on, stiffness `[0.2, 0.04]`         | Pull back toward the animated pose (group).                                       |
| `angleLimit`                  | off; on: `[0, 60]` degrees          | Maximum bend away from the animated pose (group).                                 |
| `maxDistance`                 | off; on needs a `distance`          | How far a particle may move from its animated position (group, range).            |
| `behindLimit`                 | off; on: radius `10`, distance `0`  | Keeps particles in front of their bones. `axis` is the bone axis that points out. |
| `inertia`                     | `world: 1`, `local: 1`              | How much of its motion the cloth keeps (`world`, `local`); 0 follows rigidly.     |
| `collision`                   | `{ mode: 'point', friction: 0.05 }` | `'off'`, `'point'` or `'edge'` against the cloth's colliders.                     |
| `animationBlend`              | `0`                                 | 0 keeps the cloth's rest shape, 1 follows the animated shape.                     |
| `settleTime`                  | `0.1`                               | Seconds over which the simulation fades in after a start or reset.                |

`inertia` also holds speed limits (a number or `'off'`) and `teleport`: `{ mode: 'off' }` (default), or `'reset'` or
`'keep'` with a `distance` and a `rotation` in degrees, for anchors that jump. The remaining settings
(`gravityFalloff`, `compressionLimit`, `motionStiffness`, `influence`, `rotationFollow`, `rootRotationFollow`) are
listed with their defaults in `DEFAULT_SETTINGS`. `resolveSettings` returns the full settings that an input resolves to.

### Changing a running cloth

```ts
import { tuneCloth } from 'smooth-physics';

const [simulation] = system.simulations;
tuneCloth({ simulation, settings: { gravity: 2, damping: 0.1 } });
```

`tuneCloth` keeps the particles moving, so a slider feels continuous. What you leave out keeps its current value. An
invalid value throws and leaves the cloth as it was.

`addForce({ force, mode?, uniform? })` gives every cloth an impulse. `mode: 'add'` (default) adds velocity and
`'set'` replaces it. By default particles near the roots get a smaller push; `uniform: true` pushes all of them the same.

## System

```ts
const system = ClothSystem.create({ scene, options: { frequency: 90, maxStepsPerFrame: 3 } });
```

| Option             | Default | Meaning                                                   |
| ------------------ | ------- | --------------------------------------------------------- |
| `frequency`        | `90`    | Solver steps per second, 30 to 150.                       |
| `maxStepsPerFrame` | `3`     | Steps a frame may run to catch up, 1 to 5.                |
| `include`          | all     | A function that picks which cloths of the scene to build. |
| `debug`            | `false` | Logs quality changes to the console.                      |

- `setFrequency(hz)` changes the rate while it runs, clamped to 30–150 Hz.
- `reset()` starts every cloth again from its animated pose at the next update.
- `stats` holds the last frame's physics time in milliseconds, steps, particles and collider contacts.

### Precision

`setPrecision('default' | 'rounded')`:

- `'default'` runs in 64-bit numbers. It is the fastest choice and what a new system uses.
- `'rounded'` rounds every operation to 32 bits. It repeats the recorded golden traces bit for bit, and it is slower.

Engines may compute `Math.sin`, `Math.cos`, `Math.acos` and `Math.pow` slightly differently, so neither precision
promises the same result in different browsers.

### Quality controller

`system.autoRate` keeps physics inside a time budget. It is off by default.

```ts
system.autoRate.enabled = true;
system.autoRate.budgetMs = 6;
const stop = system.onQualityChange((change) => console.info(change.level, change.reason));
```

Over budget, it lowers the rate (150, 120, 90, 60, 45 or 30 Hz, never above the starting rate), then the steps per
frame. With room to spare it raises
them again. It changes nothing during the first 2 seconds, while the engine warms up. The level is `'full'`,
`'reduced'` or `'minimum'`, and `system.quality.frameCap30` is true when frames arrive at a steady 30 fps, as in iOS Low
Power Mode. With `autoRate.precision = true`, a system set to `'rounded'` switches to `'default'` while its steps are
slow, and back when there is room.

## Coordinates

`coordinates` in the scene says which axis is up and which hand the axes follow. Everything the scene takes and gives is
in those coordinates: transforms, rest poses, colliders, gravity, the behind-limit axis, poses, forces and `output`.

| Engine                     | `coordinates`                               |
| -------------------------- | ------------------------------------------- |
| three.js, glTF, PlayCanvas | `{ up: 'y', handedness: 'right' }`          |
| Babylon.js, Unity          | `{ up: 'y', handedness: 'left' }` (default) |
| Blender                    | `{ up: 'z', handedness: 'right' }`          |
| Unreal, in metres          | `{ up: 'z', handedness: 'left' }`           |

Defaults that point somewhere follow the up axis: with Z up, gravity pulls along `[0, 0, -1]` and the behind limit uses
the bone's Z axis.

## Errors

Every refusal is a thrown `SmoothPhysicsError`. Its message names the first problem and where it is, for example
`hair settings: damping: …`.

| Code                 | Thrown by                                                                  |
| -------------------- | -------------------------------------------------------------------------- |
| `INVALID_CLOTH_SPEC` | `createClothScene`, `resolveSettings`, `createThreeCloth` and `tuneCloth`. |
| `INVALID_OPTIONS`    | `ClothSystem.create` and `createThreeCloth`, for system options.           |
| `MISSING_OBJECT`     | `ThreeClothAdapter` when a transform has no three.js object.               |

## Development

```sh
pnpm --filter smooth-physics test                       # unit and golden tests
pnpm --filter smooth-physics test:performance           # performance regression test
pnpm --filter smooth-physics bench:baseline             # record new performance baselines
pnpm --filter smooth-physics run generate:unrounded     # writes src/solver-unrounded.ts from src/solver.ts
```

- **Golden traces.** Recorded scenes run 600 frames in both precisions, and their state is hashed every 60 frames. The
  hashes must stay the same: synthetic scenes, two recorded skeletons, scenes for every option, and the three.js adapter.
- **Performance regression test.** `test:performance` times every benchmark case at a 60 Hz display rate in Node,
  WebKit and Chromium: robes of four sizes, chains, a curtain, and a three.js mannequin through the adapter. It fails
  when a case is more than 15% and more than 0.01 ms slower than its baseline in `bench/results/`; the three.js time
  spent outside the solver is reported but too small to judge. Baselines are machine-specific: after a change meant to
  alter performance, record them again on the same machine with `bench:baseline`. `bench/run.ts` and
  `bench/browser.ts` accept `--only`, `--cases` and `--tolerance`.
- **Two solver files.** `src/solver.ts` is the solver, written with a Float32 rounding call on every operation.
  `src/solver-unrounded.ts` is generated from it without those calls, for `'default'` precision. Do not edit it: the
  package's `test`, `pack`, `bench` and `bench:browser` and the showcase's `dev`, `build` and `check` generate it
  first and overwrite it, so what they run always matches `solver.ts`.
- **Positional numbers in hot code.** `solver.ts` and `src/float32/` take numbers as separate parameters, not one
  object. Rotating 2,048,000 vectors with one object parameter was 4.0× slower in Node, 3.5× in WebKit and 5.2× in
  Chromium.
- **One local per component.** The solver writes vector math out per axis (`toRootX`, `toRootY`, `toRootZ`) instead
  of creating vector objects.
- **Fields and arrays instead of number arguments.** In V8, a number passed to or returned from a call that the
  engine did not inline is boxed in a new heap object. The collision and angle steps are classes whose methods share
  values through fields, and the math helpers (`rotateVectorAt`, `multiplyQuaternionsAt`, `fromToRotationAt` …) read
  their inputs from a Float64Array and an offset and write results to `RESULT`. Values computed on the spot go through
  `INPUT` first. Helpers take Float64Arrays only, so every array access stays monomorphic. `vpx bench/allocations.ts`
  lists what still allocates; most of what it reports for the benchmark scenes comes from the benchmark's own pose
  driver.
