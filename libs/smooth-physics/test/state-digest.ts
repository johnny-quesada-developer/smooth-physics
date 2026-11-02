// SHA-256 of every particle state array of every simulation, used by the golden traces.
import { createHash } from 'node:crypto';
import type { ClothSystem } from '../src/cloth-system.ts';

const STATE = [
  'nextPositions',
  'oldPositions',
  'velocityOrigins',
  'velocities',
  'displacementVelocities',
  'displayPositions',
  'positions',
  'rotations',
  'collisionNormals',
  'outputRotations',
  'outputLocalPositions',
  'outputLocalRotations',
  'frictions',
  'staticFrictions',
] as const satisfies readonly string[];

export function stateDigest(system: ClothSystem): string {
  const hash = createHash('sha256');
  for (const simulation of system.simulations)
    for (const arrayName of STATE) {
      const values = simulation[arrayName];
      hash.update(Buffer.from(new Float64Array(values instanceof Float64Array ? values : values.flat()).buffer));
    }
  return hash.digest('hex');
}
