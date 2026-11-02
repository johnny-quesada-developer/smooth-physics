// Per-particle values in flat arrays: particle i's vector is at 3i to 3i + 2 and its quaternion at 4i to 4i + 3.
// Float64Array holds every Float32 value exactly, so both precisions use it.
import type { Quaternion, ReadonlyQuaternion } from './float32/quaternion.ts';
import type { ReadonlyVector3, Vector3 } from './float32/vector.ts';

export const vectorBuffer = (particleCount: number): Float64Array => new Float64Array(particleCount * 3);

// Every quaternion starts as the identity.
export function quaternionBuffer(particleCount: number): Float64Array {
  const buffer = new Float64Array(particleCount * 4);
  for (let wOffset = 3; wOffset < buffer.length; wOffset += 4) buffer[wOffset] = 1;
  return buffer;
}

// A copy, so the caller may keep it while the buffer changes.
export const vectorAt = (buffer: Float64Array, particle: number): Vector3 => [buffer[particle * 3], buffer[particle * 3 + 1], buffer[particle * 3 + 2]];

export const quaternionAt = (buffer: Float64Array, particle: number): Quaternion => [
  buffer[particle * 4],
  buffer[particle * 4 + 1],
  buffer[particle * 4 + 2],
  buffer[particle * 4 + 3],
];

export function writeVector(buffer: Float64Array, particle: number, vector: ReadonlyVector3): void {
  buffer[particle * 3] = vector[0];
  buffer[particle * 3 + 1] = vector[1];
  buffer[particle * 3 + 2] = vector[2];
}

export function writeQuaternion(buffer: Float64Array, particle: number, quaternion: ReadonlyQuaternion): void {
  buffer[particle * 4] = quaternion[0];
  buffer[particle * 4 + 1] = quaternion[1];
  buffer[particle * 4 + 2] = quaternion[2];
  buffer[particle * 4 + 3] = quaternion[3];
}
