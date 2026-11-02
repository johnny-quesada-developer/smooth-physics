// A scene described in any supported coordinates must simulate exactly like the same scene in the solver's own:
// the conversion only moves and negates numbers. Each scene is rewritten into the other coordinates, driven by the
// same motion rewritten the same way, and compared bit for bit.
import { ClothSystem } from '../src/cloth-system.ts';
import { describe, expect, test } from 'vite-plus/test';
import { createClothScene, type BoneAxis, type ClothSettingsInput, type ColliderSpec, type SceneSpec } from '../src/authoring.ts';
import { Axes, type Coordinates } from '../src/coordinates.ts';
import { fround } from '../src/float32/scalar.ts';
import type { Pose } from '../src/cloth-state.ts';
import type { Quaternion } from '../src/float32/quaternion.ts';
import type { Vector3 } from '../src/float32/vector.ts';
import { OPTION_SCENES } from './option-scenes.ts';
import { buildScene, createDriver, type ClothOverride, type SceneKind } from './scenes.ts';
import { stateDigest } from './state-digest.ts';

const COORDINATES: readonly Coordinates[] = [
  { up: 'y', handedness: 'right' },
  { up: 'z', handedness: 'left' },
  { up: 'z', handedness: 'right' },
];
const SIGNED_AXES: readonly BoneAxis[] = ['x', 'y', 'z', '-x', '-y', '-z'];
const behindOverride = OPTION_SCENES.find((option) => option.name === 'chains-blend-behind-steps')?.override ?? {};
const SCENES: readonly { readonly kind: SceneKind; readonly override: ClothOverride }[] = [
  { kind: 'mannequin', override: { settings: { gravityDirection: [0.3, -1, 0.2] } } },
  { kind: 'curtain', override: {} },
  { kind: 'chains', override: behindOverride },
];

// The inverse of the library's conversion, written from its tables.
function toUser(axes: Axes): {
  vector: (value: readonly [number, number, number]) => Vector3;
  rotation: (value: readonly [number, number, number, number]) => Quaternion;
  scale: (value: readonly [number, number, number]) => Vector3;
  matrix: (value: readonly number[]) => number[];
  axis: (solverAxis: BoneAxis) => BoneAxis;
} {
  return {
    vector: (value) => axes.vectorToUser(value, [0, 0, 0]),
    rotation: (value) => axes.rotationToUser(value, [0, 0, 0, 1]),
    scale: (value) => [value[axes.to[0]], value[axes.to[1]], value[axes.to[2]]],
    // Solver element index came from user element matrixFrom[index], times matrixSign[index] (±1); this undoes it.
    matrix: (value) => {
      const userMatrix = Array.from({ length: 16 }, () => 0);
      value.forEach((element, index) => (userMatrix[axes.matrixFrom[index] ?? index] = (axes.matrixSign[index] ?? 1) * element));
      return userMatrix;
    },
    axis: (solverAxis) => SIGNED_AXES.find((candidate) => axes.axisToSolver(candidate) === solverAxis) ?? solverAxis,
  };
}

function rewriteSpec({ spec, coordinates }: { spec: SceneSpec; coordinates: Coordinates }): SceneSpec {
  const user = toUser(new Axes(coordinates));
  const rewriteSettings = (input: ClothSettingsInput | undefined): ClothSettingsInput | undefined => {
    if (!input) return input;
    const behind = input.behindLimit;
    return {
      ...input,
      ...(input.gravityDirection ? { gravityDirection: user.vector(input.gravityDirection) } : {}),
      ...(behind && behind.enabled !== false ? { behindLimit: { ...behind, axis: user.axis(behind.axis ?? 'y') } } : {}),
    };
  };
  const rewriteCollider = (collider: ColliderSpec): ColliderSpec => {
    const center = collider.center ? { center: user.vector(collider.center) } : {};
    if (collider.shape === 'sphere') return { ...collider, ...center };
    // A capsule whose axis turns negative stays in place by reversing.
    const axis = user.axis(collider.axis ?? 'y');
    const negative = axis.startsWith('-');
    return {
      ...collider,
      ...center,
      axis: axis.replace('-', '') === 'x' ? 'x' : axis.replace('-', '') === 'y' ? 'y' : 'z',
      reverse: (collider.reverse === true) !== negative,
    };
  };

  return {
    coordinates,
    transforms: spec.transforms.map((transform) => ({
      ...transform,
      ...(transform.position ? { position: user.vector(transform.position) } : {}),
      ...(transform.rotation ? { rotation: user.rotation(transform.rotation) } : {}),
      ...(transform.scale ? { scale: user.scale(transform.scale) } : {}),
    })),
    cloths: spec.cloths.map((cloth) => {
      const rewritten = rewriteSettings(cloth.settings);
      return { ...cloth, ...(rewritten ? { settings: rewritten } : {}) };
    }),
    colliders: (spec.colliders ?? []).map(rewriteCollider),
  };
}

describe('coordinates', () => {
  test('the per-frame kernels equal the general conversion for every coordinate system', () => {
    const values = Array.from({ length: 16 }, (_, index) => Math.sin(index * 12.9898 + 0.1) * 3);
    const [componentX = 0, componentY = 0, componentZ = 0, componentW = 0] = values;
    const triple: [number, number, number] = [componentX, componentY, componentZ];
    const quaternion: [number, number, number, number] = [componentX, componentY, componentZ, componentW];
    // COORDINATES leaves out the solver's own coordinates (left-handed, Y up); their kernels are checked too.
    for (const coordinates of [{ up: 'y', handedness: 'left' } as const, ...COORDINATES]) {
      const axes = new Axes(coordinates);
      const kernels = axes.kernels;
      const general = values.map((_, index) => fround((axes.matrixSign[index] ?? 1) * (values[axes.matrixFrom[index] ?? index] ?? 0)));
      expect(kernels.matrix(values)).toEqual(general);
      expect(kernels.position(triple)).toEqual(axes.vectorToSolver(triple).map(fround));
      expect(kernels.rotation(quaternion)).toEqual(axes.rotationToSolver(quaternion).map(fround));
      expect(kernels.scale(triple)).toEqual(axes.scaleToSolver(triple).map(fround));
      // Read at an offset, as from a flat particle buffer.
      expect(kernels.vectorToUser([9, ...axes.vectorToSolver(triple)], 1, [0, 0, 0])).toEqual(triple);
      expect(kernels.rotationToUser([9, 9, ...axes.rotationToSolver(quaternion)], 2, [0, 0, 0, 1])).toEqual(quaternion);
    }
  });

  for (const { kind, override } of SCENES) {
    for (const coordinates of COORDINATES) {
      test(`${kind} with ${coordinates.handedness}-handed ${coordinates.up} up matches the solver's coordinates bit for bit`, () => {
        const synthetic = buildScene({ kind, size: 'small', override });
        const rewritten = createClothScene(rewriteSpec({ spec: synthetic.spec, coordinates }));
        const native = ClothSystem.create({ scene: synthetic.scene });
        const converted = ClothSystem.create({ scene: rewritten });
        const driver = createDriver(synthetic);
        const user = toUser(new Axes(coordinates));
        const userPose = (id: number): Pose => {
          const pose = driver.pose(id);
          return {
            position: user.vector(pose.position),
            rotation: user.rotation(pose.rotation),
            scale: user.scale(pose.scale),
            matrix: user.matrix(pose.matrix),
          };
        };

        for (let frame = 0; frame < 240; frame++) {
          driver.advance(frame / 60);
          if (frame === 120) {
            native.addForce({ force: [12, 3, -6] });
            converted.addForce({ force: user.vector([12, 3, -6]) });
          }
          const frameDeltaTime = frame % 7 === 3 ? 1 / 30 : 1 / 60;
          native.update({ frameDeltaTime, pose: driver.pose });
          converted.update({ frameDeltaTime, pose: userPose });
          if (frame % 60 !== 59) continue;

          expect(stateDigest(converted), `frame ${frame}`).toBe(stateDigest(native));
          native.simulations.forEach((simulation, index) => {
            const output = converted.simulations[index]?.output;
            expect(output?.positions).toEqual(simulation.output.positions.map(user.vector));
            expect(output?.rotations).toEqual(simulation.output.rotations.map(user.rotation));
            expect(output?.localPositions).toEqual(simulation.output.localPositions.map(user.vector));
            expect(output?.localRotations).toEqual(simulation.output.localRotations.map(user.rotation));
            expect(output?.localValid).toEqual(simulation.output.localValid);
          });
        }
      });
    }
  }
});
