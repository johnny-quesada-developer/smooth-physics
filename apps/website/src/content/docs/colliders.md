---
title: Colliders
lead: Spheres and capsules that follow your transforms and keep particles out of a body.
section: concepts
order: 3
kind: concept
example: dress-form
tags: [colliders, sphere, capsule, tapered capsule, endRadius, align, center, axis, contact, point, edge, friction, radius, robe, legs]
features: [colliders]
---

Colliders are attached to transforms and follow them every frame. They are listed once in the spec, and each cloth names the ones it reacts to.

## Shapes

```ts
colliders: [
  { object: head, shape: 'sphere', radius: 0.09 },
  { object: thigh, shape: 'capsule', radius: 0.075, endRadius: 0.06, length: 0.42, center: [0, -0.21, 0] },
],
```

- A **sphere** has a `radius`.
- A **capsule** has a `radius` and a `length`, and lies along `axis` of its object: `'x'`, `'y'` (default) or `'z'`.
  `length` is measured from tip to tip, end caps included, so a capsule of radius 0.1 and length 0.2 is a sphere.
- `align: 'center'` (default) centres the capsule on its object. `align: 'start'` starts it at the object and runs it along the axis.
- `endRadius` tapers the capsule toward its far end, which fits arms and legs. `reverse: true` runs it along the negative axis.
- `center` offsets either shape in its object's local space, in metres.
- `enabled: false` builds the collider switched off.

All sizes are in metres. Every option is listed in [createClothScene](../create-cloth-scene/#colliderspec).

## Which cloth collides with what

A cloth collides only with the colliders it lists.

- With three.js, `colliders` on a cloth lists indexes into `spec.colliders`.
- Without three.js, a collider names its transform with `transform`, and cloths list colliders by `id`. Without an `id`, colliders are named `'collider1'`, `'collider2'` and so on, in list order.

```ts
// createThreeCloth
spec: {
  colliders: [{ object: hips, shape: 'capsule', radius: 0.14, length: 0.3, axis: 'x' }],
  cloths: [{ name: 'robe', bones: robeRoots, anchor: hips, connection: 'ring', colliders: [0] }],
}

// createClothScene
colliders: [{ id: 'hips', transform: 7, shape: 'capsule', radius: 0.14, length: 0.3, axis: 'x' }],
cloths: [{ name: 'robe', roots: robeRoots, anchor: 7, connection: 'ring', colliders: ['hips'] }],
```

## Particle size

Each particle is a sphere of `radius` metres, `0.02` by default. Like other ranges it can change from root to tip, so a tassel can end in a larger knot.

```ts
settings: { radius: [0.01, 0.03] },
```

## Point and edge contact

The `collision` setting picks how particles meet colliders.

| Mode                | Tests                                    | Use it for                                  |
| ------------------- | ---------------------------------------- | ------------------------------------------- |
| `'point'` (default) | Each particle                            | Chains and most cloth. The cheaper choice.  |
| `'edge'`            | Each particle and the edges between them | Surfaces a thin collider could slip through |
| `'off'`             | Nothing                                  | A cloth that should pass through everything |

## Friction

`friction`, from 0 to 1, slows particles that slide over a collider. The default is `0.05`. A little more stops a robe from slipping off the hips.

```ts
settings: { collision: { mode: 'edge', friction: 0.2 } }
```

`{ mode: 'off' }` takes no friction: a cloth that collides with nothing has none to set.

## See the shapes

Every example with colliders has a **Show colliders** switch that draws the shapes the solver uses. The [robe on a mannequin](../../examples/dress-form/) fits tapered capsules to the legs.
