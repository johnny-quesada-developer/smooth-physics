---
title: three.js adapter
lead: Creates cloth from three.js objects and writes the results back into the bones every frame.
section: reference
order: 5
kind: reference
module: smooth-physics/three
example: hanging-chains
tags:
  [
    three.js,
    createThreeCloth,
    ThreeClothAdapter,
    THREE_COORDINATES,
    ThreeClothSpec,
    ThreeColliderSpec,
    ThreeSceneSpec,
    restore,
    update,
    addForce,
    setEnabled,
    setSimulationEnabled,
    particles,
    skinned mesh,
    bones,
  ]
features: [animation]
---

```ts
import { createThreeCloth, THREE_COORDINATES, ThreeClothAdapter } from 'smooth-physics/three';
```

The adapter is a separate entry point, so apps without three.js never load it. It does not import three.js: you pass your `three` module in.

## createThreeCloth

```ts
function createThreeCloth(input: {
  three: ThreeModule; // your three.js module
  root: THREE.Object3D;
  spec: ThreeSceneSpec;
  options?: SystemOptions;
}): ThreeClothAdapter;
```

| Parameter | Type             | Default  | Description                                                                              |
| --------- | ---------------- | -------- | ---------------------------------------------------------------------------------------- |
| `three`   | `ThreeModule`    | required | Your three.js module, for example `import * as THREE from 'three'`.                      |
| `root`    | `THREE.Object3D` | required | The object that contains every bone, anchor and collider object.                         |
| `spec`    | `ThreeSceneSpec` | required | The cloths and colliders.                                                                |
| `options` | `SystemOptions`  | `{}`     | Options of the system it creates. See [ClothSystem](../cloth-system/#clothsystemcreate). |

- It reads `root` and everything below it once, in its current pose. That pose is the rest pose.
- Objects that draw (meshes, lines, points, sprites, lights and cameras) are skipped, with everything below them.
- Throws a `SmoothPhysicsError`: `INVALID_CLOTH_SPEC` for a bad spec, or when a bone, anchor or collider object is not a non-drawing object inside `root`; `INVALID_OPTIONS` for bad options.

```ts
import * as THREE from 'three';
import { createThreeCloth } from 'smooth-physics/three';

const cloth = createThreeCloth({
  three: THREE,
  root: model,
  spec: {
    colliders: [{ object: head, shape: 'sphere', radius: 0.09 }],
    cloths: [{ name: 'hair', bones: [hairRoot], anchor: head, colliders: [0], settings: { radius: 0.015 } }],
  },
});
```

## ThreeSceneSpec

```ts
type ThreeSceneSpec = { readonly cloths: readonly ThreeClothSpec[]; readonly colliders?: readonly ThreeColliderSpec[] };
```

### ThreeClothSpec

| Field        | Type                        | Default                | Description                                                               |
| ------------ | --------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `name`       | `string`                    | `` `cloth${n}` ``      | The simulation's name.                                                    |
| `bones`      | `readonly THREE.Object3D[]` | required, at least one | The root of each chain. Every non-drawing object below is a particle.     |
| `anchor`     | `THREE.Object3D`            | `root`                 | The object the cloth moves with.                                          |
| `connection` | `ClothConnection`           | `'chains'`             | `'chains'`, `'nearest'`, `'strip'` or `'ring'`.                           |
| `fixed`      | `readonly THREE.Object3D[]` | `bones`                | Bones that follow the animation without simulating. Replaces the default. |
| `exclude`    | `readonly THREE.Object3D[]` | `[]`                   | Bones left out of the cloth.                                              |
| `colliders`  | `readonly number[]`         | `[]`                   | Indexes into `spec.colliders` that this cloth collides with.              |
| `settings`   | `ClothSettingsInput`        | `{}`                   | See [Settings reference](../settings-reference/).                         |
| `enabled`    | `boolean`                   | `true`                 | `false` leaves the cloth out.                                             |
| `normals`    | `'bone' \| 'outward'`       | `'bone'`               | `'outward'` points normals away from the cloth's centre.                  |

### ThreeColliderSpec

A collider spec of [createClothScene](../create-cloth-scene/#colliderspec), with `object` in place of `transform` and `id`.

| Field                                             | Type                 | Description                              |
| ------------------------------------------------- | -------------------- | ---------------------------------------- |
| `object`                                          | `THREE.Object3D`     | The object it follows.                   |
| `shape`, `radius`, `center`, `enabled`            | as in `ColliderSpec` | `center` is in the object's local space. |
| `length`, `endRadius`, `axis`, `align`, `reverse` | as in `ColliderSpec` | Capsules only.                           |

## ThreeClothAdapter

What `createThreeCloth` returns.

| Member                                          | Description                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `restore()`                                     | Puts back the bone poses the cloth overwrote. Call it before your animation.                           |
| `update({ deltaTime, root })`                   | Simulates and writes the bones. Call it after your animation, before rendering.                        |
| `addForce({ force, mode?, uniform? })`          | Pushes every cloth. `force` is in three.js world space. See [ForceInput](../cloth-system/#forceinput). |
| `setEnabled(enabled)`                           | Pauses or resumes every cloth. Pausing restores the bones; resuming resets the cloths.                 |
| `setSimulationEnabled({ simulation, enabled })` | Pauses or resumes one cloth. Both put its bones back; resuming resets it.                              |
| `particles(simulation)`                         | The particle positions of one cloth in three.js world space, for drawing.                              |
| `simulations`                                   | The `SimulatedCloth` of every built cloth.                                                             |
| `system`                                        | The `ClothSystem` it drives.                                                                           |
| `nodes`                                         | `ReadonlyMap<number, THREE.Object3D>`: each transform id's object.                                     |
| `enabled`                                       | `false` while paused with `setEnabled(false)`.                                                         |

### update

| Parameter   | Type             | Description                                           |
| ----------- | ---------------- | ----------------------------------------------------- |
| `deltaTime` | `number`         | Seconds since the last frame.                         |
| `root`      | `THREE.Object3D` | The object whose world matrices it brings up to date. |

`update` calls `root.updateMatrixWorld(true)` before it reads the poses and again after it writes the bones, so anything that reads bone positions afterwards sees the new pose. Moving bones get a new local position and rotation; fixed bones get a new rotation. While the adapter is disabled, `update` does nothing.

### ThreeClothAdapter.fromNodes

```ts
static fromNodes(input: {
  three: ThreeModule;
  nodes: ReadonlyMap<number, THREE.Object3D>;
  scene: ClothScene;
  options?: SystemOptions;
}): ThreeClothAdapter;
```

Builds an adapter for a scene you made with `createClothScene` in `THREE_COORDINATES`, with the object for each transform id. Throws `MISSING_OBJECT` when a transform has no object.

## THREE_COORDINATES

```ts
const THREE_COORDINATES: Coordinates; // { up: 'y', handedness: 'right' }
```

The coordinates of three.js. Use it in `createClothScene` when a scene built without the adapter, for example in a worker, should use three.js numbers.

## ThreeModule

```ts
type ThreeModule = Pick<typeof THREE, 'Matrix4' | 'Quaternion' | 'Vector3'>;
```

Only the math classes the adapter constructs, so code that cannot load all of three.js can pass just these.
