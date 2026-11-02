// The library reads what callers pass and never writes into it, in this frame or a later one; and state it keeps
// between frames (such as a collider's last seen position) stays its own.
import { describe, expect, test } from 'vite-plus/test';
import { ClothSystem } from '../src/cloth-system.ts';
import type { Pose } from '../src/cloth-state.ts';
import { buildScene, createDriver } from './scenes.ts';

const copyOf = (pose: Pose): Pose => ({ position: [...pose.position], rotation: [...pose.rotation], scale: [...pose.scale], matrix: [...pose.matrix] });

describe('inputs', () => {
  test('poses and forces passed in are never changed', () => {
    const synthetic = buildScene({ kind: 'mannequin', size: 'small' });
    const driver = createDriver(synthetic);
    const system = ClothSystem.create({ scene: synthetic.scene });
    const seen: { readonly pose: Pose; readonly copy: Pose }[] = [];
    const force: [number, number, number] = [3, 1, -2];

    for (let frame = 0; frame < 90; frame++) {
      driver.advance(frame / 60);
      if (frame === 30) system.addForce({ force });
      system.update({
        frameDeltaTime: 1 / 60,
        pose: (id) => {
          const pose = driver.pose(id);
          if (frame >= 60) seen.push({ pose, copy: copyOf(pose) });
          return pose;
        },
      });
    }

    expect(force).toEqual([3, 1, -2]);
    for (const { pose, copy } of seen) expect(pose).toEqual(copy);
  });

  test('the motion tracker compares against its own copy of the last collider position', () => {
    const synthetic = buildScene({ kind: 'chains', size: 'small' });
    const driver = createDriver(synthetic);
    const system = ClothSystem.create({ scene: synthetic.scene });
    system.autoRate.enabled = true;
    system.autoRate.motionBoost.mode = 'always';

    let fastest = 0;
    for (let frame = 0; frame < 30; frame++) {
      driver.advance(frame / 60);
      system.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
      fastest = Math.max(fastest, system.motion.speed);
    }
    // The ball swings, so its speed between frames is never zero unless the last position aliases the current one.
    expect(fastest).toBeGreaterThan(0);
  });
});
