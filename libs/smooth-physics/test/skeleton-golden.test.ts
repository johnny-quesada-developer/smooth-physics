// Golden traces of two recorded skeletons with many cloths: curves with several keys, rest poses that differ from
// the start pose, and outward normals. The hashes were recorded with the first, JavaScript version of smooth-physics.
import { readFileSync } from 'node:fs';
import { ClothSystem } from '../src/cloth-system.ts';
import { describe, expect, test } from 'vite-plus/test';
import { createClothScene, type SceneSpec, type TransformSpec } from '../src/authoring.ts';
import type { Pose } from '../src/cloth-state.ts';
import { fround } from '../src/float32/scalar.ts';
import { composeMatrix, multiplyMatrices } from '../src/float32/matrix.ts';
import { axisAngle, multiplyQuaternions, normalizeQuaternion, type Quaternion } from '../src/float32/quaternion.ts';
import { multiplyVectors, type Vector3 } from '../src/float32/vector.ts';
import { readGoldenTraces } from './golden-file.ts';
import { stateDigest } from './state-digest.ts';

const traces = readGoldenTraces(new URL('./golden/skeletons.json', import.meta.url));

// The skeleton root walks, bounces and turns; every transform below it keeps its local pose.
function createRootDriver(spec: SceneSpec): { readonly pose: (id: number) => Pose; advance(time: number): void } {
  const transforms = new Map<number, TransformSpec>(spec.transforms.map((transform) => [transform.id, transform]));
  // World poses of this frame, by transform id.
  const cache = new Map<number, Pose>();
  let root: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], matrix: composeMatrix([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]) };

  const pose = (id: number): Pose => {
    const cached = cache.get(id);
    if (cached) return cached;
    const transform = transforms.get(id);
    if (!transform) return root;

    const [positionX, positionY, positionZ] = transform.position ?? [0, 0, 0];
    const [rotationX, rotationY, rotationZ, rotationW] = transform.rotation ?? [0, 0, 0, 1];
    const [scaleX, scaleY, scaleZ] = transform.scale ?? [1, 1, 1];
    const position: Vector3 = [fround(positionX), fround(positionY), fround(positionZ)];
    const scale: Vector3 = [fround(scaleX), fround(scaleY), fround(scaleZ)];
    const rotation: Quaternion = [fround(rotationX), fround(rotationY), fround(rotationZ), fround(rotationW)];

    const parent = transform.parent ? pose(transform.parent) : root;
    const matrix = multiplyMatrices(parent.matrix, composeMatrix(position, rotation, scale));
    const world: Pose = {
      position: [matrix[12], matrix[13], matrix[14]],
      rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, rotation)),
      scale: multiplyVectors(parent.scale, scale),
      matrix,
    };
    cache.set(id, world);
    return world;
  };

  return {
    pose,
    advance(time: number): void {
      cache.clear();
      const position: Vector3 = [fround(0.35 * Math.sin(time * 2.1)), fround(Math.max(0, Math.sin(time * 5)) * 0.15), fround(0.2 * Math.sin(time * 3.3))];
      const rotation = axisAngle([0, 1, 0], fround(time * 3 + Math.sin(time * 1.7)));
      root = { position, rotation, scale: [1, 1, 1], matrix: composeMatrix(position, rotation, [1, 1, 1]) };
    },
  };
}

describe('skeleton golden traces', () => {
  for (const trace of traces) {
    test(`${trace.scene} ${trace.precision}`, () => {
      const spec: SceneSpec = JSON.parse(readFileSync(new URL(`./golden/${trace.scene}.json`, import.meta.url), 'utf8'));
      const scene = createClothScene(spec);
      const system = ClothSystem.create({ scene: scene });
      const driver = createRootDriver(spec);
      const hashes: string[] = [];
      system.setPrecision(trace.precision);

      for (let frame = 0; frame < trace.frames; frame++) {
        driver.advance(frame / 60);
        if (frame === 300) system.addForce({ force: [12, 3, -6] });
        // Every seventh frame lasts twice as long, so the number of solver steps per frame varies.
        system.update({ frameDeltaTime: frame % 7 === 3 ? 1 / 30 : 1 / 60, pose: driver.pose });
        if (frame % 60 === 59) hashes.push(stateDigest(system));
      }
      expect(hashes).toEqual(trace.hashes);
    });
  }
});
