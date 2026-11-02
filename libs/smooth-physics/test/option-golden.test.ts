// The animation blend, the behind-limit axis, step and multi-key curves and outward normals, through createClothScene.
// The hashes were recorded with the package before these options were removed.
import { ClothSystem } from '../src/cloth-system.ts';
import { describe, expect, test } from 'vite-plus/test';
import { readGoldenTraces } from './golden-file.ts';
import { OPTION_SCENES } from './option-scenes.ts';
import { buildScene, createDriver } from './scenes.ts';
import { stateDigest } from './state-digest.ts';

const traces = readGoldenTraces(new URL('./golden/options.json', import.meta.url));

describe('option golden traces', () => {
  for (const trace of traces) {
    test(`${trace.scene} ${trace.precision}`, () => {
      const option = OPTION_SCENES.find((candidate) => candidate.name === trace.scene);
      if (!option) throw new Error(`Unknown scene ${trace.scene}`);
      const synthetic = buildScene({ kind: option.kind, size: 'medium', override: option.override });
      const system = ClothSystem.create({ scene: synthetic.scene });
      const driver = createDriver(synthetic);
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
