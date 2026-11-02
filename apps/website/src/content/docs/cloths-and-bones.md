---
title: Cloths, bones and particles
nav: Cloths and bones
lead: A cloth is the set of bones below its roots; each bone becomes a particle that the solver moves and writes back.
section: concepts
order: 1
kind: concept
example: hanging-chains
tags: [cloth, bones, particles, roots, anchor, fixed, exclude, rest pose, restPose, normals, outward, skinning]
features: [connections]
---

`smooth-physics` simulates cloth on bones. It does not move mesh vertices. It moves the bones that a skinned mesh, or anything else, follows. Every frame it reads the animated pose of the bones, simulates, and writes a new pose back.

## Roots and particles

Each cloth names its roots: `bones` with three.js, `roots` (transform ids) without. Every transform below a root belongs to the cloth, and each one becomes a particle.

```ts
// createThreeCloth: three.js objects
{ name: 'hair', bones: [hairRoot], anchor: head }

// createClothScene: transform ids
{ name: 'hair', roots: [12], anchor: 3 }
```

- With three.js, objects that draw are never particles: meshes, lines, points, sprites, lights and cameras. Nothing below them is read either.
- A root may not sit below another root of the same cloth. A transform that is reached twice is refused.
- A cloth has at most 4,096 particles.

## The anchor

The anchor is the transform the cloth moves with, usually the parent of its roots: the rail of a curtain, the hips of a robe, the head for hair. Particle positions are kept relative to it, and its movement through the world is what the cloth feels as inertia.

With three.js, `anchor` defaults to the `root` you pass to `createThreeCloth`. With `createClothScene` it is required.

## Fixed, moving and excluded bones

Each particle is fixed, moving or left out.

| Kind     | Set by                | What happens                                                |
| -------- | --------------------- | ----------------------------------------------------------- |
| Fixed    | `fixed`, or the roots | Follows the animation. The solver may turn it, not move it. |
| Moving   | every other bone      | Simulated, then written back.                               |
| Excluded | `exclude`             | Not part of the cloth: never simulated, never written.      |

`fixed` defaults to the roots. When you pass it, it replaces that default, so list the roots in it as well if they should stay fixed. Every bone in `fixed` and `exclude` must belong to the cloth.

```ts
cloths: [{ name: 'cape', bones: capeRoots, anchor: spine, fixed: [...capeRoots, ...shoulderBones] }];
```

## The rest pose

A cloth is built in the pose its transforms have when you create it. Rest lengths, rest angles and the shape that `animationBlend: 0` keeps all come from that pose.

- With three.js, pose the model before you call `createThreeCloth`.
- With `createClothScene`, the transforms' `position`, `rotation` and `scale` are the rest pose, unless the cloth has a `restPose`.

`restPose` builds the cloth in another pose: one world pose for every transform of the cloth and for its anchor, with unit quaternions. A missing or extra transform throws.

```ts
restPose: [
  { id: 1, position: [0, 1.6, 0], rotation: [0, 0, 0, 1] },
  { id: 2, position: [0, 1.6, 0], rotation: [0, 0, 0, 1] },
  { id: 3, position: [0, 1.5, 0], rotation: [0, 0, 0, 1] },
],
```

## Normals

`normals: 'bone'` (the default) takes each particle's normal from its bone. For a closed ring such as a robe, `normals: 'outward'` points each normal away from the cloth's centre instead.

## Several cloths

A spec can hold several cloths, each with its own roots, anchor, connection, colliders and settings. They share one system: one simulation rate, one step budget and one quality controller.

- `enabled: false` in a cloth's spec leaves it out of the system.
- `setSimulationEnabled({ simulation, enabled })` on the three.js adapter pauses one cloth and puts its bones back.
- Without three.js, set `simulation.enabled`, and call `simulation.reset()` when you turn it back on.

## What comes back

- The three.js adapter writes a new local position and rotation into every moving bone, and a new rotation into fixed bones.

- Without three.js, each simulation's `output` holds world and local poses for every particle. See [ClothSystem](../cloth-system/#simulatedcloth).
