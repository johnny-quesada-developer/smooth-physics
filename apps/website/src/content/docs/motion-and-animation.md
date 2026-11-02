---
title: Motion and animation
lead: How a cloth follows an animated model, and the settings that decide how much of that motion it feels.
section: concepts
order: 5
kind: concept
example: fringe-lamp
tags: [animation, mixer, restore, update, frame order, animationBlend, inertia, world, local, speed limit, teleport, force, wind, addForce, settleTime, reset]
features: [animation, inertia, teleport, wind]
---

The cloth reads the animated pose of its bones, simulates on top of it, and writes the result back. Animation, inertia and forces decide where the particles go.

## The frame order

The cloth must read the pose your animation produced, not the one it wrote last frame. With three.js:

```ts
function frame(deltaTime: number): void {
  cloth.restore(); // before the animation: the bones the cloth wrote go back to rest
  mixer.update(deltaTime);
  cloth.update({ deltaTime, root: model }); // after the animation: simulate and write
  renderer.render(scene, camera);
}
```

`restore()` matters even for bones the mixer does not animate: without it, last frame's result would feed the next one. Without three.js, the pose function you pass to `system.update` returns the animated pose. See [Any engine and Web Workers](../engines-and-workers/).

## animationBlend

`animationBlend` decides which shape the cloth keeps, from 0 to 1.

- `0` (default): the cloth keeps the shape of its rest pose.
- `1`: the cloth follows the shape of the animated pose.

## Inertia

When the anchor moves, the cloth lags behind and swings. `inertia` sets how much of that it feels, from 0 to 1.

| Value                 | Default | Meaning                                                                    |
| --------------------- | ------- | -------------------------------------------------------------------------- |
| `inertia.world`       | `1`     | How much of the anchor's movement through the world the cloth feels.       |
| `inertia.local`       | `1`     | The same for the motion of the cloth's own fixed bones, such as a spin.    |
| `inertia.smoothing`   | `0.2`   | Smooths the anchor's velocity, so jittery motion swings the cloth less.    |
| `inertia.rootFollow`  | `0`     | Lets particles near the root follow the anchor more closely than the tips. |
| `inertia.centrifugal` | `0`     | Pushes particles outward while the cloth spins.                            |

At `world: 0` and `local: 0` the cloth follows rigidly. A character that runs through a level often wants `world` below 1, so its hair does not stream far behind.

```ts
settings: { inertia: { world: 0.6, local: 1 } }
```

## Speed limits

Anchor motion faster than a movement or rotation limit carries the cloth along instead of being felt as inertia. `particleSpeedLimit` caps the speed of each particle. Each limit is a number or `'off'`.

| Limit                             | Default | Unit             |
| --------------------------------- | ------- | ---------------- |
| `inertia.movementSpeedLimit`      | `5`     | m/s              |
| `inertia.rotationSpeedLimit`      | `720`   | degrees a second |
| `inertia.localMovementSpeedLimit` | `'off'` | m/s              |
| `inertia.localRotationSpeedLimit` | `'off'` | degrees a second |
| `inertia.particleSpeedLimit`      | `4`     | m/s              |

## Teleports

When a model jumps, such as on a cut or a respawn, the cloth would fly after it. `inertia.teleport` handles jumps of the anchor.

```ts
settings: { inertia: { teleport: { mode: 'reset', distance: 0.5, rotation: 90 } } }
```

- `'reset'` restarts the cloth in its new place.
- `'keep'` carries the cloth's current shape along to the new place.
- A move of at least `distance` metres, or a turn of at least `rotation` degrees, in one frame counts as a jump. Without them, `0.5` and `90`.
- `{ mode: 'off' }` (default) treats every movement as motion.

## Forces

`addForce` pushes every cloth of the adapter or system, for example for wind. The force is in the scene's coordinates and acts as an extra acceleration, in m/s², during the next update that runs steps. Call it every frame for a steady wind.

```ts
cloth.addForce({ force: [wind * 0.25, 0, -wind] });
```

- `mode: 'add'` (default) adds to the particles' velocity. `mode: 'set'` replaces it.
- By default particles near the roots get a smaller push. `uniform: true` pushes all of them the same.
- A second call before the next update replaces the first.

## Starting and resetting

After it is built, and after every reset, a cloth fades in over `settleTime` seconds, `0.1` by default, so it does not jump at its first frame. `system.reset()` starts every cloth again from its animated pose at the next update. Each `SimulatedCloth` also has its own `reset()`.

## See it

- [Fringe lamp](../../examples/fringe-lamp/): world and local inertia on a swinging, spinning lampshade, and a teleport.

- [Robe on a mannequin](../../examples/dress-form/): cloth on a walking, twirling model.
