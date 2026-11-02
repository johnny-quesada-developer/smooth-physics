// Hashes a coverage scene every 60 frames: the solver state and how many times the watchdog reset it.
import { ClothSystem } from '../src/cloth-system.ts';
import type { Precision } from '../src/cloth-state.ts';
import { buildCoverageScene } from './coverage-scenes.ts';
import { stateDigest } from './state-digest.ts';

export function coverageTrace({ name, precision, frames }: { name: string; precision: Precision; frames: number }): string[] {
  const coverageScene = buildCoverageScene(name);
  const system = ClothSystem.create({ scene: coverageScene.scene });
  const hashes: string[] = [];
  system.setPrecision(precision);

  for (let frame = 0; frame < frames; frame++) {
    coverageScene.advance(frame);
    const force = coverageScene.force(frame);
    if (force) system.addForce(force);
    // Every seventh frame lasts twice as long, so the number of solver steps per frame varies.
    system.update({ frameDeltaTime: frame % 7 === 3 ? 1 / 30 : 1 / 60, pose: coverageScene.pose });
    if (frame % 60 === 59) hashes.push(`${stateDigest(system)}:${system.stats.resets}`);
  }
  return hashes;
}
