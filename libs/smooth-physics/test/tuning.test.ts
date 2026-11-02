// Live tuning must equal building the cloth with the new settings, patch what it is given, and throw for invalid
// settings.
import { describe, expect, test } from 'vite-plus/test';
import { createClothScene, type ClothSettingsInput } from '../src/authoring.ts';
import type { ClothScene } from '../src/scene-format/types.ts';
import { tuneCloth } from '../src/tuning.ts';
import { stateDigest } from './state-digest.ts';
import { buildScene, createDriver } from './scenes.ts';
import { ClothSystem } from '../src/cloth-system.ts';

function chainScene(settings: ClothSettingsInput): ClothScene {
  const transforms = [
    { id: 1, name: 'root' },
    ...Array.from({ length: 8 }, (_, index) => ({ id: index + 2, parent: index + 1, position: [0, index ? -0.1 : 1, 0] as const })),
  ];
  const scene = createClothScene({ transforms, cloths: [{ name: 'chain', roots: [2], anchor: 1, settings }] });
  return scene;
}

// A cloth with triangles, so bending applies.
const curtainScene = (settings: ClothSettingsInput): ClothScene => buildScene({ kind: 'curtain', size: 'small', override: { settings } }).scene;

function createSystem(scene: ClothScene): ClothSystem {
  return ClothSystem.create({ scene });
}

describe('tuneCloth', () => {
  test('tuning before the first frame equals building with the new settings', () => {
    const tuned = createSystem(chainScene({ gravity: 5, damping: 0.05 }));
    const built = createSystem(chainScene({ gravity: 12, damping: [0.1, 0.3] }));
    const [simulation] = tuned.simulations;
    if (!simulation) throw new Error('No simulation.');
    tuneCloth({ simulation, settings: { gravity: 12, damping: [0.1, 0.3] } });

    const driver = createDriver({ scene: chainScene({}), swing: new Map() });
    for (let frame = 0; frame < 120; frame++) {
      driver.advance(frame / 60);
      tuned.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
      built.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
    }
    expect(stateDigest(tuned)).toBe(stateDigest(built));
  });

  test('a running cloth keeps its motion when tuned', () => {
    const synthetic = buildScene({ kind: 'chains', size: 'small' });
    const driver = createDriver(synthetic);
    const system = createSystem(synthetic.scene);
    for (let frame = 0; frame < 60; frame++) {
      driver.advance(frame / 60);
      system.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
    }

    const [simulation] = system.simulations;
    if (!simulation) throw new Error('No simulation.');
    const before = simulation.velocities.slice();
    tuneCloth({ simulation, settings: { gravity: 1 } });
    expect(simulation.parameters.gravity).toBe(1);
    expect(simulation.velocities).toEqual(before);
  });

  test.each([
    [{ bendingStiffness: 0 }, { bendingStiffness: 1 }],
    [{ bendingStiffness: 1 }, { bendingStiffness: 0 }],
    [{}, { gravityDirection: [0.6, -0.8, 0] as const }],
  ])('builds what bending and the gravity direction need, as a new cloth would (%#)', (initialSettings, newSettings) => {
    const tuned = createSystem(curtainScene(initialSettings));
    const built = createSystem(curtainScene(newSettings));
    const [simulation] = tuned.simulations;
    if (!simulation) throw new Error('No simulation.');
    tuneCloth({ simulation, settings: newSettings });

    const synthetic = buildScene({ kind: 'curtain', size: 'small' });
    const driver = createDriver(synthetic);
    for (let frame = 0; frame < 120; frame++) {
      driver.advance(frame / 60);
      tuned.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
      built.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
    }
    expect(stateDigest(tuned)).toBe(stateDigest(built));
  });

  test('patches: what is left out keeps the value the cloth was built with', () => {
    const [simulation] = createSystem(chainScene({ damping: 0.3, angleLimit: { degrees: [0, 40] } })).simulations;
    if (!simulation) throw new Error('No simulation.');
    tuneCloth({ simulation, settings: { gravity: 2, angleLimit: { stiffness: 0.5 } } });
    expect(simulation.settings.damping).toBe(0.3);
    expect(simulation.settings.angleLimit).toEqual({ enabled: true, degrees: [0, 40], stiffness: 0.5 });
    expect(simulation.parameters.gravity).toBe(2);
  });

  test('throws for invalid settings and leaves the cloth as it was', () => {
    const [simulation] = createSystem(chainScene({ gravity: 5 })).simulations;
    if (!simulation) throw new Error('No simulation.');
    // A variable, not a literal, so the type checker allows the typo the way untyped callers would.
    const typo = { gravty: 9.8 };
    expect(() => tuneCloth({ simulation, settings: JSON.parse(JSON.stringify(typo)) })).toThrow(expect.objectContaining({ code: 'INVALID_CLOTH_SPEC' }));
    expect(simulation.parameters.gravity).toBe(5);
  });
});
