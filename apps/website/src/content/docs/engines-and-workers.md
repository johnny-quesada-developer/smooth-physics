---
title: Any engine and Web Workers
nav: Any engine and workers
lead: Drive cloth from your own engine's transforms, and run the solver in a Web Worker so the main thread only draws.
section: guides
order: 2
kind: guide
example: worker-wall
tags:
  [
    without three.js,
    engine,
    babylon,
    playcanvas,
    createClothScene,
    ClothSystem,
    pose,
    PoseSource,
    output,
    worker,
    web worker,
    easy-web-worker,
    transferable,
    thread,
  ]
features: [workers, performance]
---

Your engine is not three.js, or its main thread has no time to spare for physics. The core of `smooth-physics` takes plain transforms and poses and returns poses. It does not touch the DOM or any engine, so it runs anywhere JavaScript runs, including a Web Worker.

## 1. Describe the transforms

List the transforms the cloth needs once: its bones, its anchor, and the transforms colliders follow. Poses are local to the parent, in metres, with `[x, y, z, w]` quaternions, in your engine's [coordinates](../coordinates/).

<div class="code-title">scene.ts</div>

```ts
import { ClothSystem, createClothScene } from 'smooth-physics';

export const scene = createClothScene({
  coordinates: { up: 'y', handedness: 'left' },
  transforms: [
    { id: 1, name: 'bar', position: [0, 1.9, 0] },
    { id: 2, parent: 1, position: [-0.1, 0, 0] },
    { id: 3, parent: 2, position: [0, -0.055, 0] },
    { id: 4, parent: 1, position: [0.1, 0, 0] },
    { id: 5, parent: 4, position: [0, -0.055, 0] },
    { id: 6, name: 'ball', position: [0, 1.2, 0.3] },
  ],
  colliders: [{ id: 'ball', transform: 6, shape: 'sphere', radius: 0.16 }],
  cloths: [{ name: 'wall', roots: [2, 4], anchor: 1, colliders: ['ball'], settings: { gravity: 6 } }],
});

export const system = ClothSystem.create({ scene });
```

Keep a map from your engine's objects to these ids. Ids are positive integers.

## 2. Return a pose for each transform

Each frame, `system.update` asks for the world pose of the anchor, of every transform of each cloth, and of every collider's transform. Return the pose after your animation and before you apply the cloth's result.

<div class="code-title">pose.ts</div>

```ts
import type { Pose } from 'smooth-physics';

declare const nodes: Map<number, EngineNode>; // your engine's object for each transform id

export function pose(id: number): Pose {
  const { worldPosition: position, worldRotation: rotation, worldScale: scale, worldMatrix: matrix } = nodes.get(id)!;
  return { position, rotation, scale, matrix };
}
```

- `matrix` is the world matrix as 16 numbers in column-major order, with the translation at indexes 12 to 14.
- `rotation` must be a unit quaternion.
- You may return the same arrays every frame, written in place. What the library keeps, it copies.

## 3. Step and write back

<div class="code-title">frame.ts</div>

```ts
import { pose } from './pose';
import { system } from './scene';

export function frame(deltaTime: number): void {
  system.update({ frameDeltaTime: deltaTime, pose });

  for (const simulation of system.simulations) {
    const { localPositions, localRotations, localValid } = simulation.output;
    simulation.mesh.transformIds.forEach((id, particle) => {
      if (localValid[particle]) setLocalPose(id, localPositions[particle], localRotations[particle]);
    });
  }
}
```

- `setLocalPose` stands for your engine's call that sets a bone's local position and rotation.
- `localValid[i]` is 1 for the bones that move. Their local pose is relative to the parent bone.
- `output.positions` and `output.rotations` hold the world pose of every particle, which is often all a renderer needs.
- The output arrays are reused every frame. Copy a value to keep it.
- If you write the result into the same objects your animation drives, put their animated pose back before the next frame's animation, as the three.js adapter's `restore()` does.

## 4. Move it to a Web Worker

The worker owns the system and answers one call per frame. [easy-web-worker](https://www.npmjs.com/package/easy-web-worker) makes each worker method a plain function that is typed on the main thread: what it returns resolves the call.

<div class="code-title">wall.worker.ts</div>

```ts
import { defineWorker } from 'easy-web-worker/defineWorker';

export const worker = defineWorker(() => ({
  start: (spec: WallSpec) => start(spec),
  step: (input: WallStep) => step(input),
}));

export type WallWorker = typeof worker;
```

<div class="code-title">main.ts</div>

```ts
import { createWorker } from 'easy-web-worker/createWorker';
import type { WallWorker } from './wall.worker';
import wallWorkerUrl from './wall.worker?worker&url';

const wall = createWorker<WallWorker>(wallWorkerUrl, { workerOptions: { type: 'module' } });

await wall.start({ chains: 64, links: 14 });
const frame = await wall.step({ deltaTime, time });
```

- In the worker, `step` computes the poses, calls `system.update` and returns the positions as a `Float32Array`.
- Returned values are copied between threads: about 11 KB a frame for 64 chains of 14 links.
- For much larger buffers, `onMessage().handle` lets the worker transfer them instead: `message.resolve(frame, [frame.positions.buffer])`.
- Keep one step in flight at a time, and draw the newest frame you have.

## When the coordinates are three.js

A scene built without the adapter can still use three.js numbers, for example in a worker that sends results to a three.js renderer. Pass `THREE_COORDINATES` from `smooth-physics/three`: it is a plain object, and importing it does not load three.js.

```ts
import { createClothScene } from 'smooth-physics';
import { THREE_COORDINATES } from 'smooth-physics/three';

const scene = createClothScene({ coordinates: THREE_COORDINATES, transforms, cloths, colliders });
```

## Try it

[Cloth in a worker](../../examples/worker-wall/) simulates a wall of chains in a Web Worker and draws it on the main thread. Switch it to the main thread to compare.
