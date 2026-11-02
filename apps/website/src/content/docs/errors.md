---
title: Errors
lead: Every refusal is a thrown SmoothPhysicsError with a code and a message that names the first problem.
section: reference
order: 7
kind: reference
module: smooth-physics
tags: [errors, SmoothPhysicsError, ClothErrorCode, INVALID_CLOTH_SPEC, INVALID_OPTIONS, MISSING_OBJECT, validation, throw]
---

```ts
class SmoothPhysicsError extends Error {
  readonly name: 'SmoothPhysicsError';
  readonly code: ClothErrorCode;
}

type ClothErrorCode = 'INVALID_CLOTH_SPEC' | 'INVALID_OPTIONS' | 'MISSING_OBJECT';
```

Every spec, setting and option is validated once, strictly: unknown fields are refused, numbers must be finite and in range. A call does what it was asked or throws. Two things are not validated: `setFrequency` clamps its rate to 30 to 150 Hz, and fields you write directly on a system, such as `autoRate` and `timeScale`, are used as written.

## Codes

| Code                 | Thrown by                                                                  |
| -------------------- | -------------------------------------------------------------------------- |
| `INVALID_CLOTH_SPEC` | `createClothScene`, `resolveSettings`, `createThreeCloth` and `tuneCloth`. |
| `INVALID_OPTIONS`    | `ClothSystem.create` and `createThreeCloth`, for system options.           |
| `MISSING_OBJECT`     | `ThreeClothAdapter.fromNodes`, when a transform has no three.js object.    |

## Messages

The message names the first problem and where it is, written as a path in code:

| Call                              | Message                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `createThreeCloth`, a typo        | `cloths[0].settings: Unrecognized key: "dampng"`                 |
| `createClothScene`, out of range  | `cloths[0].settings.damping: Too big: expected number to be <=1` |
| `createClothScene`, a broken tree | `Transform 4 has unknown parent 9.`                              |
| `tuneCloth` or `resolveSettings`  | `hair settings: damping: Too small: expected number to be >=0`   |
| `ClothSystem.create`              | `frequency: Too big: expected number to be <=150`                |

## Handling them

```ts
import { SmoothPhysicsError } from 'smooth-physics';
import { createThreeCloth } from 'smooth-physics/three';

try {
  const cloth = createThreeCloth({ three: THREE, root: model, spec });
  start(cloth);
} catch (error) {
  if (!(error instanceof SmoothPhysicsError)) throw error;
  showProblem(`${error.code}: ${error.message}`);
}
```

Catch them where a person can fix the input, such as a settings form, and let them fail loudly elsewhere.

## At run time

Updates do not throw for bad poses. If a cloth's state becomes non-finite, for example after a pose with `NaN` in it, the cloth is reset, a warning is logged, and `system.stats.resets` counts it.
