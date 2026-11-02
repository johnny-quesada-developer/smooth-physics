---
title: API overview
lead: Every export of smooth-physics and smooth-physics/three, and the page that documents it.
section: reference
order: 1
kind: reference
tags: [api, reference, exports, imports, types, functions, classes]
---

The library has two entry points. Apps without three.js never load the second one.

```ts
import { ClothSystem, createClothScene, tuneCloth } from 'smooth-physics';
import { createThreeCloth } from 'smooth-physics/three';
```

## smooth-physics

| Export               | Kind     | Page                                                                               |
| -------------------- | -------- | ---------------------------------------------------------------------------------- |
| `createClothScene`   | function | [createClothScene](../create-cloth-scene/)                                         |
| `ClothSystem`        | class    | [ClothSystem](../cloth-system/)                                                    |
| `SimulatedCloth`     | class    | [ClothSystem](../cloth-system/#simulatedcloth)                                     |
| `tuneCloth`          | function | [tuneCloth](../tune-cloth/)                                                        |
| `resolveSettings`    | function | [Settings reference](../settings-reference/#resolvesettings)                       |
| `DEFAULT_SETTINGS`   | constant | [Settings reference](../settings-reference/#default_settings-and-enabled_defaults) |
| `ENABLED_DEFAULTS`   | constant | [Settings reference](../settings-reference/#default_settings-and-enabled_defaults) |
| `SOLVER_COORDINATES` | constant | [Coordinates and engines](../coordinates/)                                         |
| `SmoothPhysicsError` | class    | [Errors](../errors/)                                                               |

### Types

| Types                                                                                                                                                                                                                                                                                                                                       | Page                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `SceneSpec`, `TransformSpec`, `ClothSpec`, `ColliderSpec`, `SphereColliderSpec`, `CapsuleColliderSpec`, `RestPoseSpec`, `ClothConnection`, `ClothScene`, `Coordinates`, `Axis`, `Triple`, `Rotation`                                                                                                                                        | [createClothScene](../create-cloth-scene/)   |
| `ClothSettings`, `ClothSettingsInput`, `Range`, `CurveSpec`, `CurvePoint`, `Switch`, `Off`, `On`, `SpeedLimit`, `Teleport`, `TeleportInput`, `Collision`, `CollisionInput`, `BoneAxis`, `EnabledDefaults`, and the group types `RestorationSettings`, `AngleLimitSettings`, `MaxDistanceSettings`, `BehindLimitSettings`, `InertiaSettings` | [Settings reference](../settings-reference/) |
| `SystemOptions`, `Pose`, `PoseSource`, `ForceInput`, `ForceMode`, `Precision`, `ClothOutput`, `AutoRate`, `MotionBoostMode`, `Quality`, `QualityLevel`, `QualityChange`, `QualityListener`                                                                                                                                                  | [ClothSystem](../cloth-system/)              |
| `ClothErrorCode`                                                                                                                                                                                                                                                                                                                            | [Errors](../errors/)                         |

## smooth-physics/three

| Export                                                                 | Kind     | Page                                                    |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `createThreeCloth`                                                     | function | [three.js adapter](../three-adapter/)                   |
| `ThreeClothAdapter`                                                    | class    | [three.js adapter](../three-adapter/#threeclothadapter) |
| `THREE_COORDINATES`                                                    | constant | [three.js adapter](../three-adapter/#three_coordinates) |
| `ThreeSceneSpec`, `ThreeClothSpec`, `ThreeColliderSpec`, `ThreeModule` | types    | [three.js adapter](../three-adapter/#threescenespec)    |

## Conventions

- A call with more than one input takes one object with named fields.
- Every input is validated once, strictly. Unknown fields are refused and numbers must be finite.
- A call does what it was asked or throws a `SmoothPhysicsError`. Nothing is ignored silently.
- Distances are in metres, angles in degrees, time in seconds, rotations are `[x, y, z, w]` quaternions.
- Output arrays are reused every frame. Copy a value to keep it.
