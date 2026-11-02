// System options: cloth filtering, refusals, frequency limits, step limits, precision and the quality controller.
import { describe, expect, test } from 'vite-plus/test';
import { createClothScene } from '../src/authoring.ts';
import { ClothSystem, type QualityChange } from '../src/cloth-system.ts';
import type { ClothScene } from '../src/scene-format/types.ts';
import { buildScene, createDriver } from './scenes.ts';
import { stateDigest } from './state-digest.ts';

function twoChains(): ClothScene {
  const scene = createClothScene({
    transforms: [
      { id: 1, name: 'root' },
      { id: 2, parent: 1, position: [0, 1, 0] },
      { id: 3, parent: 2, position: [0, -0.1, 0] },
      { id: 4, parent: 3, position: [0, -0.1, 0] },
      { id: 5, parent: 1, position: [0.3, 1, 0] },
      { id: 6, parent: 5, position: [0, -0.1, 0] },
    ],
    cloths: [
      { name: 'long', roots: [2], anchor: 1 },
      { name: 'short', roots: [5], anchor: 1 },
      { name: 'off', roots: [5], anchor: 1, enabled: false },
    ],
  });
  return scene;
}

describe('ClothSystem', () => {
  test('builds enabled cloths only and filters with include', () => {
    expect(ClothSystem.create({ scene: twoChains() }).stats.particles).toBe(5);
    const filtered = ClothSystem.create({ scene: twoChains(), options: { include: (cloth) => cloth.name === 'short' } });
    expect(filtered.simulations.map((simulation) => simulation.mesh.name)).toEqual(['short']);
  });

  test('addForce maps mode and uniform to the step force codes', () => {
    const system = ClothSystem.create({ scene: twoChains() });
    const codes = (): number[] => system.simulations.map((simulation) => simulation.timing.forceMode);
    system.addForce({ force: [1, 0, 0] });
    expect(codes()).toEqual([1, 1]);
    system.addForce({ force: [1, 0, 0], mode: 'set' });
    expect(codes()).toEqual([2, 2]);
    system.addForce({ force: [1, 0, 0], uniform: true });
    expect(codes()).toEqual([10, 10]);
    system.addForce({ force: [1, 0, 0], mode: 'set', uniform: true });
    expect(codes()).toEqual([11, 11]);
  });

  test('clamps the frequency to 30-150 Hz and scales the simulation power', () => {
    const system = new ClothSystem({ frequency: 500 });
    expect(system.frequency).toBe(150);
    system.setFrequency(45);
    expect(system.frequencyScale[0]).toBe(2);
    expect(system.frequencyScale[1]).toBeCloseTo(Math.SQRT2, 6);
    system.setFrequency(1);
    expect(system.frequency).toBe(30);
  });

  test('never runs more steps per frame than maxStepsPerFrame', () => {
    const synthetic = buildScene({ kind: 'chains', size: 'small' });
    const driver = createDriver(synthetic);
    const system = ClothSystem.create({ scene: synthetic.scene, options: { maxStepsPerFrame: 2 } });
    for (let frame = 0; frame < 20; frame++) {
      driver.advance(frame / 10);
      system.update({ frameDeltaTime: 1 / 10, pose: driver.pose });
      expect(system.stats.steps).toBeLessThanOrEqual(2);
    }
  });

  test("precision is 'default' unless set, and the earlier names select the same kernels", () => {
    expect(new ClothSystem().precision).toBe('default');
    const synthetic = buildScene({ kind: 'chains', size: 'small' });
    const digestAfter = (precision: Parameters<ClothSystem['setPrecision']>[0]): { precision: string; digest: string } => {
      const system = ClothSystem.create({ scene: synthetic.scene });
      const driver = createDriver(synthetic);
      system.setPrecision(precision);
      for (let frame = 0; frame < 60; frame++) {
        driver.advance(frame / 60);
        system.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
      }
      return { precision: system.precision, digest: stateDigest(system) };
    };
    const rounded = digestAfter('rounded');
    const unrounded = digestAfter('default');
    expect(digestAfter('f32')).toEqual(rounded);
    expect(digestAfter('f64')).toEqual(unrounded);
    expect(rounded.digest).not.toBe(unrounded.digest);
  });

  test("the quality controller switches 'rounded' to 'default' while steps are slow and back when there is room", () => {
    const system = new ClothSystem();
    const changes: QualityChange[] = [];
    system.onQualityChange((change) => changes.push(change));
    system.setPrecision('rounded');
    system.autoRate.enabled = true;
    system.autoRate.precision = true;
    system.adaptRate(1000);
    system.stats.steps = 1;
    system.stats.frameMs = 10;
    system.adaptRate(3100);
    expect(system.precision).toBe('default');
    expect(changes.at(-1)).toMatchObject({ level: 'reduced', reason: 'slow-steps', precision: 'default' });

    system.stats.frameMs = 0.5;
    for (let now = 3600; now < 20_000; now += 500) system.adaptRate(now);
    expect(system.precision).toBe('rounded');
    expect(changes.at(-1)).toMatchObject({ level: 'full', reason: 'recovered', precision: 'rounded' });
  });

  test("the quality controller never switches a cloth at 'default' to 'rounded'", () => {
    const system = new ClothSystem();
    system.autoRate.enabled = true;
    system.autoRate.precision = true;
    system.adaptRate(1000);
    system.stats.steps = 1;
    system.stats.frameMs = 0.5;
    for (let now = 3100; now < 20_000; now += 500) system.adaptRate(now);
    expect(system.precision).toBe('default');
    expect(system.quality.level).toBe('full');
  });

  test('the quality controller lowers the rate over budget and restores it when there is room', () => {
    const system = new ClothSystem();
    const changes: QualityChange[] = [];
    const stop = system.onQualityChange((change) => changes.push(change));
    system.autoRate.enabled = true;
    system.adaptRate(1000);
    system.stats.steps = 3;
    system.stats.frameMs = 10;
    system.adaptRate(3100);
    expect(changes.map(({ level, reason, frequency }) => ({ level, reason, frequency }))).toEqual([{ level: 'reduced', reason: 'over-budget', frequency: 60 }]);

    system.stats.frameMs = 1;
    for (let now = 3600; now < 20_000; now += 500) system.adaptRate(now);
    expect(changes.at(-1)).toMatchObject({ level: 'full', previous: 'reduced', reason: 'recovered', frequency: 90 });

    // After unsubscribing, a slow stretch reports nothing.
    stop();
    system.stats.frameMs = 50;
    for (let now = 20_000; now < 22_000; now += 500) system.adaptRate(now);
    expect(changes.length).toBe(2);
  });
});
