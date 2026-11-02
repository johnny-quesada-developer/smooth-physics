// Hashes what the three.js adapter writes: every bone's local position and rotation, the particles it reports and
// the solver state, every 60 frames of a moving three.js mannequin with one push.
import { createHash } from 'node:crypto';
import type { Precision } from '../src/cloth-state.ts';
import { stateDigest } from './state-digest.ts';
import { buildThreeScene } from './three-scenes.ts';

export function threeTrace({ precision, frames }: { precision: Precision; frames: number }): string[] {
  const scene = buildThreeScene({ kind: 'mannequin', size: 'medium' });
  const hashes: string[] = [];
  scene.adapter.system.setPrecision(precision);

  for (let frame = 0; frame < frames; frame++) {
    scene.adapter.restore();
    scene.animate(frame / 60);
    if (frame === 300) scene.adapter.addForce({ force: [12, 3, -6] });
    // Every seventh frame lasts twice as long, so the number of solver steps per frame varies.
    scene.adapter.update({ deltaTime: frame % 7 === 3 ? 1 / 30 : 1 / 60, root: scene.root });
    if (frame % 60 !== 59) continue;

    const hash = createHash('sha256');
    for (const bone of scene.bones) hash.update(Buffer.from(new Float64Array([...bone.position.toArray(), ...bone.quaternion.toArray()]).buffer));
    for (const simulation of scene.adapter.simulations) hash.update(Buffer.from(new Float64Array(scene.adapter.particles(simulation).flat()).buffer));
    hash.update(stateDigest(scene.adapter.system));
    hashes.push(hash.digest('hex'));
  }
  return hashes;
}
