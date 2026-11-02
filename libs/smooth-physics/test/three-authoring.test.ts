// Cloth authored on three.js objects: drawing objects are skipped, foreign objects refused, and the mirror into the
// solver space keeps collider offsets on the correct side.
import * as Three from 'three';
import { describe, expect, test } from 'vite-plus/test';
import { createThreeCloth, type ThreeClothAdapter } from '../src/three.ts';

type Rig = { readonly root: Three.Group; readonly bones: Three.Object3D[]; readonly sphere: Three.Object3D };

// A 6-bone chain hanging from y = 1 with a mesh attached to its second bone, and a collider holder at y = 0.7.
function chainRig(): Rig {
  const root = new Three.Group();
  const bones: Three.Object3D[] = [];
  let parent: Three.Object3D = root;
  for (let index = 0; index < 6; index++) {
    const bone = new Three.Bone();
    bone.name = `bone${index}`;
    bone.position.set(0, index === 0 ? 1 : -0.1, 0);
    parent.add(bone);
    bones.push(bone);
    parent = bone;
  }

  bones[1]?.add(new Three.Mesh(new Three.BoxGeometry(0.01, 0.01, 0.01)));
  const sphere = new Three.Object3D();
  sphere.position.set(0, 0.7, 0);
  root.add(sphere);
  return { root, bones, sphere };
}

function adapterOf({ rig, center }: { rig: Rig; center: readonly [number, number, number] }): ThreeClothAdapter {
  const [firstBone] = rig.bones;
  if (!firstBone) throw new Error('No bones.');
  const adapter = createThreeCloth({
    three: Three,
    root: rig.root,
    spec: {
      cloths: [{ name: 'chain', bones: [firstBone], colliders: [0], settings: { gravity: 9.8 } }],
      colliders: [{ object: rig.sphere, shape: 'sphere', radius: 0.08, center }],
    },
  });
  return adapter;
}

function settle({ adapter, root, frames }: { adapter: ThreeClothAdapter; root: Three.Object3D; frames: number }): void {
  for (let frame = 0; frame < frames; frame++) {
    adapter.restore();
    adapter.update({ deltaTime: 1 / 60, root });
  }
}

describe('createThreeCloth', () => {
  test('makes particles of bones only, not of drawing objects below them', () => {
    const rig = chainRig();
    const adapter = adapterOf({ rig, center: [0, 0, 0] });
    expect(adapter.simulations.map((simulation) => simulation.particleCount)).toEqual([6]);
  });

  test('refuses bones that are not inside the root', () => {
    const rig = chainRig();
    const stranger = new Three.Object3D();
    expect(() => createThreeCloth({ three: Three, root: rig.root, spec: { cloths: [{ bones: [stranger] }] } })).toThrow(
      expect.objectContaining({ code: 'INVALID_CLOTH_SPEC' }),
    );
  });

  test.each([
    [0.03, -1],
    [-0.03, 1],
  ])('a collider centered at x = %d pushes the chain to the %d side', (offset, side) => {
    const rig = chainRig();
    const adapter = adapterOf({ rig, center: [offset, 0, 0] });
    settle({ adapter, root: rig.root, frames: 240 });
    const pushedX = rig.bones.slice(2, 5).map((bone) => bone.getWorldPosition(new Three.Vector3()).x);
    for (const positionX of pushedX) expect(Math.sign(positionX)).toBe(side);
    expect(Math.max(...pushedX.map(Math.abs))).toBeGreaterThan(0.04);
  });

  test('restore() returns written bones to their rest pose', () => {
    const rig = chainRig();
    const adapter = adapterOf({ rig, center: [0.03, 0, 0] });
    const rest = rig.bones.map((bone) => bone.quaternion.clone());
    settle({ adapter, root: rig.root, frames: 60 });
    expect(rig.bones.some((bone, index) => !bone.quaternion.equals(rest[index] ?? bone.quaternion))).toBe(true);
    adapter.restore();
    rig.bones.forEach((bone, index) => expect(bone.quaternion.equals(rest[index] ?? new Three.Quaternion(1, 0, 0, 0))).toBe(true));
  });

  test('turning cloth off restores the rest pose and keeps it; turning it on simulates again', () => {
    const rig = chainRig();
    const adapter = adapterOf({ rig, center: [0.03, 0, 0] });
    const rest = rig.bones.map((bone) => bone.quaternion.clone());
    const atRest = (): boolean => rig.bones.every((bone, index) => bone.quaternion.equals(rest[index] ?? bone.quaternion));
    settle({ adapter, root: rig.root, frames: 60 });
    adapter.setEnabled(false);
    expect(atRest()).toBe(true);
    settle({ adapter, root: rig.root, frames: 10 });
    expect(atRest()).toBe(true);
    adapter.setEnabled(true);
    settle({ adapter, root: rig.root, frames: 60 });
    expect(atRest()).toBe(false);

    const [simulation] = adapter.simulations;
    if (!simulation) throw new Error('No simulation.');
    adapter.setSimulationEnabled({ simulation, enabled: false });
    settle({ adapter, root: rig.root, frames: 10 });
    expect(atRest()).toBe(true);
    adapter.setSimulationEnabled({ simulation, enabled: true });
    settle({ adapter, root: rig.root, frames: 60 });
    expect(atRest()).toBe(false);
  });

  test('a chain lags behind a root that accelerates sideways', () => {
    const rig = chainRig();
    // The collider sits far below the chain, out of reach.
    const adapter = adapterOf({ rig, center: [0, -5, 0] });
    settle({ adapter, root: rig.root, frames: 60 });
    for (let frame = 0; frame < 12; frame++) {
      rig.root.position.x += 0.01 * frame;
      adapter.restore();
      adapter.update({ deltaTime: 1 / 60, root: rig.root });
    }
    const tip = rig.bones.at(-1)?.getWorldPosition(new Three.Vector3()).x ?? Number.NaN;
    expect(tip).toBeLessThan(rig.root.position.x - 0.05);
  });
});
