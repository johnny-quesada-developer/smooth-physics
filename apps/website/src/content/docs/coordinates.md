---
title: Coordinates and engines
nav: Coordinates
lead: Tell a scene which axis is up and which hand its axes follow, and every number you pass and get back stays in your engine's coordinates.
section: concepts
order: 6
kind: concept
example: worker-wall
tags: [coordinates, up axis, handedness, left-handed, right-handed, y up, z up, babylon, unity, blender, unreal, playcanvas, gltf, units, metres, quaternion]
features: [workers]
---

The solver has no dependency on any engine. A scene made with `createClothScene` says once which coordinates it uses, and the library converts at the edges.

## The coordinates option

`coordinates` has two fields: `up` (`'y'` or `'z'`) and `handedness` (`'left'` or `'right'`).

| Engine                     | `coordinates`                               |
| -------------------------- | ------------------------------------------- |
| three.js, glTF, PlayCanvas | `{ up: 'y', handedness: 'right' }`          |
| Babylon.js, Unity          | `{ up: 'y', handedness: 'left' }` (default) |
| Blender                    | `{ up: 'z', handedness: 'right' }`          |
| Unreal, in metres          | `{ up: 'z', handedness: 'left' }`           |

The default is the solver's own coordinates, `SOLVER_COORDINATES`: left-handed with Y up. The three.js adapter always uses `THREE_COORDINATES`, `{ up: 'y', handedness: 'right' }`, so you never set it there.

```ts
import { createClothScene } from 'smooth-physics';

const scene = createClothScene({ coordinates: { up: 'z', handedness: 'right' }, transforms, cloths });
```

## What stays in your coordinates

Everything the scene takes and gives:

- transforms, rest poses and collider offsets,
- `gravityDirection` and the `behindLimit` axis,
- the poses you return each frame, and the forces you pass to `addForce`,
- each simulation's `output`.

## The conversion is exact

The supported coordinate systems differ from the solver's only by which axis is which and by sign. Converting moves and negates numbers and never rounds, so a cloth in any of them moves exactly as it would in the solver's own coordinates.

## Directions follow the up axis

Defaults that point somewhere follow `up`. With Z up, gravity pulls along `[0, 0, -1]` and the behind limit uses the bone's Z axis. A `gravityDirection` or `behindLimit.axis` you write yourself is used as written.

## Units

- Distances are in metres. Engines that work in centimetres, such as Unreal, divide by 100 before they pass positions.
- Rotations are quaternions `[x, y, z, w]`. Transform rotations are normalized when they are read. Rest poses and the poses you return each frame are used as given, so they must be unit quaternions.
- Transform ids are positive integers.
- Angles in settings are in degrees, and time is in seconds.

## Next

[Any engine and Web Workers](../engines-and-workers/) builds a scene from an engine's transforms, feeds it poses every frame and writes the results back.
