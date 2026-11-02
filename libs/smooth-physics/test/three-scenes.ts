// three.js copies of the synthetic scenes for the adapter: the solver space mirrored on X, built with
// createThreeCloth and moved like createDriver moves the synthetic poses.
import * as Three from 'three';
import { createThreeCloth, type ThreeClothAdapter, type ThreeColliderSpec } from '../src/three.ts';
import { fround } from '../src/float32/scalar.ts';
import { axisAngle, multiplyQuaternions, normalizeQuaternion, type Quaternion } from '../src/float32/quaternion.ts';
import { buildScene, type SceneKind, type SceneSize } from './scenes.ts';

export type ThreeScene = {
  readonly root: Three.Group;
  readonly adapter: ThreeClothAdapter;
  readonly bones: readonly Three.Object3D[];
  // Poses the animated (non-cloth) objects for this time, as an animation mixer would.
  animate(time: number): void;
};

export function buildThreeScene({ kind, size }: { kind: SceneKind; size: SceneSize }): ThreeScene {
  const { spec, swing } = buildScene({ kind, size });
  const root = new Three.Group();
  const nodes = new Map<number, Three.Object3D>();
  // Mirroring X negates X positions, and the Y and Z parts of rotations.
  for (const transform of spec.transforms) {
    const bone = new Three.Bone();
    const [positionX, positionY, positionZ] = transform.position ?? [0, 0, 0];
    const [rotationX, rotationY, rotationZ, rotationW] = transform.rotation ?? [0, 0, 0, 1];
    const [scaleX, scaleY, scaleZ] = transform.scale ?? [1, 1, 1];
    bone.position.set(-positionX, positionY, positionZ);
    bone.quaternion.set(rotationX, -rotationY, -rotationZ, rotationW);
    bone.scale.set(scaleX, scaleY, scaleZ);
    nodes.set(transform.id, bone);
    (transform.parent ? (nodes.get(transform.parent) ?? root) : root).add(bone);
  }
  const node = (id: number): Three.Object3D => nodes.get(id) ?? root;

  const colliderSpecs = spec.colliders ?? [];
  const colliderIndex = new Map(colliderSpecs.map((collider, index) => [collider.id ?? `collider${index + 1}`, index]));
  const colliders = colliderSpecs.map((collider): ThreeColliderSpec => {
    const [centerX, centerY, centerZ] = collider.center ?? [0, 0, 0];
    const object = node(collider.transform);
    if (collider.shape === 'sphere') return { object, shape: 'sphere', radius: collider.radius, center: [-centerX, centerY, centerZ] };
    // Mirroring X turns an X capsule around, so it is reversed here to stay where the synthetic scene puts it.
    const axis = collider.axis ?? 'y';
    return {
      object,
      shape: 'capsule',
      radius: collider.radius,
      length: collider.length,
      axis,
      center: [-centerX, centerY, centerZ],
      reverse: axis === 'x' ? collider.reverse !== true : collider.reverse === true,
      ...(collider.endRadius === undefined ? {} : { endRadius: collider.endRadius }),
      ...(collider.align === undefined ? {} : { align: collider.align }),
    };
  });

  const clothAdapter = createThreeCloth({
    three: Three,
    root,
    spec: {
      colliders,
      cloths: spec.cloths.map((cloth) => ({
        ...(cloth.name === undefined ? {} : { name: cloth.name }),
        bones: cloth.roots.map(node),
        anchor: node(cloth.anchor),
        ...(cloth.connection === undefined ? {} : { connection: cloth.connection }),
        ...(cloth.fixed === undefined ? {} : { fixed: cloth.fixed.map(node) }),
        ...(cloth.exclude === undefined ? {} : { exclude: cloth.exclude.map(node) }),
        colliders: (cloth.colliders ?? []).map((key) => colliderIndex.get(key) ?? -1),
        ...(cloth.settings === undefined ? {} : { settings: cloth.settings }),
      })),
    },
  });

  const mirrored = (rotation: Quaternion): [number, number, number, number] => [rotation[0], -rotation[1], -rotation[2], rotation[3]];
  const swinging = [...swing].map(([id, axis]) => ({ node: node(id), axis }));
  return {
    root,
    adapter: clothAdapter,
    bones: [...nodes.values()],
    animate(time: number): void {
      root.position.set(-fround(0.35 * Math.sin(time * 2.1)), fround(Math.max(0, Math.sin(time * 5)) * 0.12), fround(0.25 * Math.sin(time * 3.3)));
      root.quaternion.fromArray(mirrored(axisAngle([0, 1, 0], fround(time * 2.5 + Math.sin(time * 1.7)))));
      const angle = fround(0.55 * Math.sin(time * 4));
      for (const { node: swingingBone, axis } of swinging)
        swingingBone.quaternion.fromArray(mirrored(normalizeQuaternion(multiplyQuaternions([0, 0, 0, 1], axisAngle(axis, angle)))));
    },
  };
}
