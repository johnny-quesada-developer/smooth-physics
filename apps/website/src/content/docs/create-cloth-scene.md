---
title: createClothScene
lead: Builds a cloth scene from plain transforms, cloths and colliders, in the coordinates you choose.
section: reference
order: 2
kind: reference
module: smooth-physics
tags:
  [
    createClothScene,
    SceneSpec,
    TransformSpec,
    ClothSpec,
    ColliderSpec,
    RestPoseSpec,
    ClothScene,
    transforms,
    roots,
    anchor,
    fixed,
    exclude,
    colliders,
    restPose,
    normals,
  ]
features: [connections, colliders]
---

```ts
function createClothScene(spec: SceneSpec): ClothScene;
```

Pass the result to [`ClothSystem.create`](../cloth-system/). Throws a `SmoothPhysicsError` with code `INVALID_CLOTH_SPEC` for anything it cannot build exactly as described.

```ts
import { ClothSystem, createClothScene } from 'smooth-physics';

const scene = createClothScene({
  coordinates: { up: 'y', handedness: 'right' },
  transforms: [
    { id: 1, name: 'head', position: [0, 1.7, 0] },
    { id: 2, parent: 1, position: [0, 0.05, -0.1] },
    { id: 3, parent: 2, position: [0, -0.12, 0] },
  ],
  colliders: [{ id: 'skull', transform: 1, shape: 'sphere', radius: 0.09 }],
  cloths: [{ name: 'ponytail', roots: [2], anchor: 1, colliders: ['skull'] }],
});
const system = ClothSystem.create({ scene });
```

## SceneSpec

| Field         | Type                       | Default                           | Description                                   |
| ------------- | -------------------------- | --------------------------------- | --------------------------------------------- |
| `coordinates` | `Coordinates`              | `{ up: 'y', handedness: 'left' }` | The scene's up axis and handedness.           |
| `transforms`  | `readonly TransformSpec[]` | required, at least one            | Every transform the cloths and colliders use. |
| `cloths`      | `readonly ClothSpec[]`     | required                          | The cloths to build.                          |
| `colliders`   | `readonly ColliderSpec[]`  | `[]`                              | Shapes the cloths can collide with.           |

`Coordinates` is `{ up: 'y' | 'z'; handedness: 'left' | 'right' }`. See [Coordinates and engines](../coordinates/).

## TransformSpec

A transform's pose is relative to its parent. A transform without a parent is in world space.

| Field      | Type       | Default        | Description                                                  |
| ---------- | ---------- | -------------- | ------------------------------------------------------------ |
| `id`       | `number`   | required       | A positive integer, unique in the scene.                     |
| `name`     | `string`   | `` `t${id}` `` | A name for messages.                                         |
| `parent`   | `number`   | none           | The id of the parent transform.                              |
| `position` | `Triple`   | `[0, 0, 0]`    | Local position, in metres.                                   |
| `rotation` | `Rotation` | `[0, 0, 0, 1]` | Local rotation `[x, y, z, w]`. Normalized; must not be zero. |
| `scale`    | `Triple`   | `[1, 1, 1]`    | Local scale.                                                 |

`Triple` is `readonly [number, number, number]` and `Rotation` is `readonly [number, number, number, number]`.

## ClothSpec

| Field        | Type                            | Default                | Description                                                                         |
| ------------ | ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `name`       | `string`                        | `` `cloth${n}` ``      | The simulation's name, used in messages and by `tuneCloth`.                         |
| `roots`      | `readonly number[]`             | required, at least one | The first transform of each chain. Everything below is the cloth.                   |
| `anchor`     | `number`                        | required               | The transform the cloth moves with.                                                 |
| `connection` | `ClothConnection`               | `'chains'`             | `'chains'`, `'nearest'`, `'strip'` or `'ring'`. See [Connections](../connections/). |
| `fixed`      | `readonly number[]`             | the roots              | Transforms that follow the animation without simulating. Replaces the default.      |
| `exclude`    | `readonly number[]`             | `[]`                   | Transforms left out of the cloth.                                                   |
| `colliders`  | `readonly (string \| number)[]` | `[]`                   | Ids of the colliders this cloth collides with.                                      |
| `settings`   | `ClothSettingsInput`            | `{}`                   | See [Settings reference](../settings-reference/).                                   |
| `enabled`    | `boolean`                       | `true`                 | `false` leaves the cloth out of the system.                                         |
| `restPose`   | `readonly RestPoseSpec[]`       | the transforms' pose   | Builds the cloth in another pose.                                                   |
| `normals`    | `'bone' \| 'outward'`           | `'bone'`               | `'outward'` points normals away from the cloth's centre.                            |

- `n` counts cloths from 1 in list order.
- Roots may not contain each other, and every id in `fixed` and `exclude` must belong to the cloth.
- A cloth has at most 4,096 particles.

## ColliderSpec

`ColliderSpec` is `SphereColliderSpec | CapsuleColliderSpec`. Both have these fields:

| Field       | Type                    | Default              | Description                                        |
| ----------- | ----------------------- | -------------------- | -------------------------------------------------- |
| `id`        | `string \| number`      | `` `collider${n}` `` | The id cloths use to name it. Unique in the scene. |
| `transform` | `number`                | required             | The transform it follows.                          |
| `shape`     | `'sphere' \| 'capsule'` | required             | The shape.                                         |
| `radius`    | `number`                | required             | Radius in metres, greater than 0.                  |
| `center`    | `Triple`                | `[0, 0, 0]`          | Offset in the transform's local space.             |
| `enabled`   | `boolean`               | `true`               | `false` builds the collider switched off.          |

A capsule also has:

| Field       | Type                  | Default    | Description                                                          |
| ----------- | --------------------- | ---------- | -------------------------------------------------------------------- |
| `length`    | `number`              | required   | Length along the axis from tip to tip, end caps included, in metres. |
| `endRadius` | `number`              | `radius`   | Radius at the far end, for a tapered capsule.                        |
| `axis`      | `'x' \| 'y' \| 'z'`   | `'y'`      | The transform's axis it lies along.                                  |
| `align`     | `'center' \| 'start'` | `'center'` | Centred on the transform, or starting at it.                         |
| `reverse`   | `boolean`             | `false`    | Runs the capsule along the negative axis.                            |

## RestPoseSpec

One world pose, in the scene's coordinates. A `restPose` lists one for every transform of the cloth and for its anchor.

| Field      | Type       | Default     | Description                                |
| ---------- | ---------- | ----------- | ------------------------------------------ |
| `id`       | `number`   | required    | The transform.                             |
| `position` | `Triple`   | required    | World position, in metres.                 |
| `rotation` | `Rotation` | required    | World rotation; must be a unit quaternion. |
| `scale`    | `Triple`   | `[1, 1, 1]` | World scale.                               |

## ClothScene

```ts
type ClothScene = {
  readonly coordinates: Coordinates;
  readonly transforms: ReadonlyMap<number, TransformRecord>;
  readonly cloths: readonly ClothRecord[];
  readonly colliders: ReadonlyMap<number, ColliderRecord>;
};
```

The validated scene, converted to the solver's coordinates. Treat it as opaque: pass it to `ClothSystem.create`. The `include` option of `ClothSystem.create` receives its `ClothRecord`s, whose `name` and `enabled` are the cloth's.

## Errors

The message names the first problem and where it is, for example:

- `cloths[0].roots: Too small: expected array to have >=1 items`
- `Transform 4 has unknown parent 9.`
- `ponytail: unknown collider skull.`
- `ponytail: fixed or excluded transform 1 is not part of this cloth.`

See [Errors](../errors/).
