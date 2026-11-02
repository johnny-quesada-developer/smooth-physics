---
title: Getting started
lead: Install smooth-physics, hang a chain of bones in a three.js scene and step it every frame.
section: start
order: 1
kind: guide
example: hanging-chains
install: true
tags: [install, setup, three.js, chain, bones, createThreeCloth, update loop, restore, quick start]
features: [gravity]
---

The three.js adapter works with the `three` package your app already uses. Install `three` as well if the project does not have it yet.

## 1. Build a chain of bones

`smooth-physics` moves chains of bones. Any three.js object that draws nothing can be a bone: a `Bone`, a `Group` or a plain `Object3D`. This chain hangs from a bar, one bone every 6 cm.

<div class="code-title">chain.ts</div>

```ts
import * as THREE from 'three';

export const bar = new THREE.Group();
bar.position.y = 1.6;

export const chain = new THREE.Bone();
bar.add(chain);

let link = chain;
for (let index = 1; index < 10; index++) {
  const next = new THREE.Bone();
  next.position.y = -0.06;
  link.add(next);
  link = next;
}
```

## 2. Create the cloth

`createThreeCloth` comes from `smooth-physics/three`. You pass in your `three` module, the root object of the scene and a spec. Each object in `bones` is the root of a chain: it stays fixed, and every object below it becomes a particle. The cloth moves with its `anchor`.

<div class="code-title">cloth.ts</div>

```ts
import * as THREE from 'three';
import { createThreeCloth } from 'smooth-physics/three';
import { bar, chain } from './chain';

export const scene = new THREE.Scene();
scene.add(bar);

export const cloth = createThreeCloth({
  three: THREE,
  root: scene,
  spec: { cloths: [{ name: 'chain', bones: [chain], anchor: bar }] },
});
```

Every input is validated when you create the cloth. A misspelled option or a value out of range throws a `SmoothPhysicsError` whose message names it, for example `cloths[0].settings: Unrecognized key: "dampng"`. See [Errors](../errors/).

## 3. Show it

Bones draw nothing. A `SkeletonHelper` draws them as lines, which is enough to watch the chain move.

<div class="code-title">view.ts</div>

```ts
import * as THREE from 'three';
import { bar } from './chain';
import { scene } from './cloth';

const aspect = innerWidth / innerHeight;
export const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 20);
camera.position.set(0, 1.2, 2.5);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

scene.add(new THREE.SkeletonHelper(bar));
```

## 4. Step it every frame

Each frame, call `restore()` before you animate anything and `update()` after. Here the bar swings, and the chain follows with its own motion.

<div class="code-title">main.ts</div>

```ts
import { bar } from './chain';
import { cloth, scene } from './cloth';
import { camera, renderer } from './view';

let last = 0;
renderer.setAnimationLoop((time) => {
  const deltaTime = last ? (time - last) / 1000 : 0;
  last = time;

  cloth.restore();
  bar.rotation.z = Math.sin(time / 1000) * 0.4;
  cloth.update({ deltaTime, root: scene });

  renderer.render(scene, camera);
});
```

- `restore()` puts back the bone poses the cloth wrote last frame, so your animation starts from them.
- `update({ deltaTime, root })` reads the animated pose, simulates, and writes the result into the bones. `deltaTime` is in seconds.
- With an `AnimationMixer`, call `mixer.update(deltaTime)` between the two.

## 5. Change how it moves

Settings are given per cloth. What you leave out keeps its default. In `cloth.ts`, give the chain stronger gravity and more damping toward the tip:

<div class="code-title">cloth.ts</div>

```ts
export const cloth = createThreeCloth({
  three: THREE,
  root: scene,
  spec: {
    cloths: [
      {
        name: 'chain',
        bones: [chain],
        anchor: bar,
        settings: { gravity: 9.8, damping: [0.05, 0.2] },
      },
    ],
  },
});
```

`damping: [0.05, 0.2]` is a range from the root to the tip. [Settings](../settings/) explains ranges, curves and the settings that switch on and off.

## Without three.js

The core takes plain transforms and poses, so it works with any engine. Describe the transforms once, in metres, with rotations as `[x, y, z, w]` quaternions. Each frame, pass a function that returns the world pose of a transform after your animation.

<div class="code-title">chain.ts</div>

```ts
import { ClothSystem, createClothScene, type Pose } from 'smooth-physics';

const scene = createClothScene({
  coordinates: { up: 'y', handedness: 'right' },
  transforms: [
    { id: 1, name: 'bar', position: [0, 1.6, 0] },
    { id: 2, parent: 1 },
    { id: 3, parent: 2, position: [0, -0.06, 0] },
    { id: 4, parent: 3, position: [0, -0.06, 0] },
  ],
  cloths: [{ name: 'chain', roots: [2], anchor: 1 }],
});
const system = ClothSystem.create({ scene });

declare const worldPose: (id: number) => Pose; // from your engine

system.update({ frameDeltaTime: 1 / 60, pose: worldPose });
// The new local rotations, to write back to your bones:
system.simulations[0]?.output.localRotations;
```

[Any engine and Web Workers](../engines-and-workers/) shows the whole loop, including what a pose holds and how to run the solver in a worker.

## Where to go next

- [Cloths, bones and particles](../cloths-and-bones/): roots, anchors, fixed bones and the rest pose.

- [Settings](../settings/): gravity, damping, stiffness, and how values change from root to tip.

- [Colliders](../colliders/): keep cloth out of a body with spheres and capsules.

- [Motion and animation](../motion-and-animation/): animated models, inertia, teleports and wind.

- [The hanging chains example](../../examples/hanging-chains/): change the gravity and the damping while it runs.
