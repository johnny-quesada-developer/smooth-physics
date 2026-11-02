import { fround, maximum, multiply } from './float32/scalar.ts';
import type { Quaternion, ReadonlyQuaternion } from './float32/quaternion.ts';
import type { ReadonlyVector3, Vector3 } from './float32/vector.ts';
import type { ColliderRecord } from './scene-format/types.ts';

export type ColliderTypeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ColliderType: {
  readonly Sphere: 1;
  readonly CapsuleXCenter: 2;
  readonly CapsuleYCenter: 3;
  readonly CapsuleZCenter: 4;
  readonly CapsuleXStart: 5;
  readonly CapsuleYStart: 6;
  readonly CapsuleZStart: 7;
} = { Sphere: 1, CapsuleXCenter: 2, CapsuleYCenter: 3, CapsuleZCenter: 4, CapsuleXStart: 5, CapsuleYStart: 6, CapsuleZStart: 7 };
export type Bounds = { readonly minimum: Vector3; readonly maximum: Vector3 };
// prepareColliderStep fills one per collider in place every step.
export type ColliderWork = {
  readonly type: ColliderTypeValue;
  readonly inverseOldRotation: Quaternion;
  readonly rotation: ReadonlyQuaternion;
  readonly radius: [start: number, end: number];
  readonly bounds: Bounds;
  readonly oldPositions: readonly [start: Vector3, end: Vector3];
  readonly nextPositions: readonly [start: Vector3, end: Vector3];
};

export function colliderType(collider: ColliderRecord): ColliderTypeValue {
  if (collider.type === 'sphere') return ColliderType.Sphere;
  const axis = collider.direction;
  if (collider.alignedOnCenter) return axis === 0 ? ColliderType.CapsuleXCenter : axis === 1 ? ColliderType.CapsuleYCenter : ColliderType.CapsuleZCenter;
  return axis === 0 ? ColliderType.CapsuleXStart : axis === 1 ? ColliderType.CapsuleYStart : ColliderType.CapsuleZStart;
}

// A sphere's radius is x. A capsule's start and end radii are x and y, both x without radius separation, and its
// length is z. Every size is at least 0.001.
export function colliderSize(collider: ColliderRecord): Vector3 {
  const size = collider.size;
  const dimensions: Vector3 = collider.type === 'capsule' && !collider.radiusSeparation ? [size.x, size.x, size.z] : [size.x, size.y, size.z];
  return [maximum(fround(dimensions[0]), fround(0.001)), maximum(fround(dimensions[1]), fround(0.001)), maximum(fround(dimensions[2]), fround(0.001))];
}

// Fixed-point (1e-6) integer accumulation with truncation, so the summation order does not change results.
const toInteger = (value: number): number => Math.trunc(value) | 0;

export class FixedPointAccumulator {
  readonly sum: Int32Array;
  readonly count: Int32Array;
  readonly floatMaximum: Int32Array;
  readonly sumSecondary: Int32Array;

  constructor(particleCount: number) {
    this.sum = new Int32Array(particleCount * 3);
    this.count = new Int32Array(particleCount);
    this.floatMaximum = new Int32Array(particleCount);
    this.sumSecondary = new Int32Array(particleCount * 3);
  }

  addVector(particle: number, value: ReadonlyVector3): void {
    this.count[particle]++;
    for (let axis = 0; axis < 3; axis++) this.sum[particle * 3 + axis] = (this.sum[particle * 3 + axis] + toInteger(multiply(value[axis], 1000000))) | 0;
  }

  addSecondaryVector(particle: number, value: ReadonlyVector3): void {
    for (let axis = 0; axis < 3; axis++)
      this.sumSecondary[particle * 3 + axis] = (this.sumSecondary[particle * 3 + axis] + toInteger(multiply(value[axis], 1000000))) | 0;
  }

  // The maximum truncates to an integer before scaling to fixed point.
  maximum(particle: number, value: number): void {
    const fixedPoint = Math.imul(toInteger(value), 1000000);
    if (fixedPoint > this.floatMaximum[particle]) this.floatMaximum[particle] = fixedPoint;
  }

  clear(particle: number): void {
    this.count[particle] = 0;
    this.floatMaximum[particle] = 0;
    for (let axis = 0; axis < 3; axis++) {
      this.sum[particle * 3 + axis] = 0;
      this.sumSecondary[particle * 3 + axis] = 0;
    }
  }
}
