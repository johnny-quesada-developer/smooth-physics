// The TypeScript solver and authoring must reproduce the golden traces recorded from the first, JavaScript version of smooth-physics.
import { ClothSystem } from '../src/cloth-system.ts';
import { describe, expect, test } from 'vite-plus/test';
import { buildScene, createDriver, type SceneKind } from './scenes.ts';
import { readGoldenTraces } from './golden-file.ts';
import { stateDigest } from './state-digest.ts';

const traces = readGoldenTraces(new URL('./golden/synthetic.json', import.meta.url));
const kinds: readonly SceneKind[] = ['mannequin', 'chains', 'curtain'];

describe('golden traces', () => {
  for (const trace of traces) {
    test(`${trace.scene} ${trace.precision}`, () => {
      const kind = kinds.find((candidate) => trace.scene.startsWith(candidate));
      if (!kind) throw new Error(`Unknown scene ${trace.scene}`);
      const synthetic = buildScene({ kind, size: 'medium' });
      const driver = createDriver(synthetic);
      const system = ClothSystem.create({ scene: synthetic.scene });
      system.setPrecision(trace.precision);

      const hashes: string[] = [];
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
