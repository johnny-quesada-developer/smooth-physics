import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition, ThreadColor } from '@/features/Stage/runtime/types';
import { addChain, straightDown } from './rigging';

export function createFabricSwatchScene({ color }: { color: ThreadColor }): SceneDefinition {
  const root = new THREE.Group(),
    rail = new THREE.Group(),
    ball = new THREE.Group();
  rail.position.y = 1.55;
  root.add(rail, ball);
  const rod = createProp({ geometry: new THREE.CylinderGeometry(0.012, 0.012, 1.05, 12), color: 'ink', metalness: 0.4 });
  rod.rotation.z = Math.PI / 2;
  rail.add(rod);
  ball.add(createProp({ geometry: new THREE.SphereGeometry(0.1, 32, 20), color: 'stone', roughness: 0.35 }));
  const roots = Array.from({ length: 9 }, (_, index) =>
    addChain({ parent: rail, origin: [-0.4 + index * 0.1, 0, (index % 2) * 0.015], links: 10, step: straightDown(0.07) }),
  );
  return {
    root,
    camera: { target: [0, 1.15, 0], distance: 2.1, height: 1.3, azimuth: 0.3 },
    grabbable: [ball],
    // A held ball stays just in front of the rail, so it presses into the swatch without cutting through it.
    grabPlane: { normal: [0, 0, 1], minimum: 0.08 },
    styles: { swatch: { color } },
    setup: (values) => ({
      colliders: [{ object: ball, shape: 'sphere', radius: 0.1 }],
      cloths: [{ name: 'swatch', bones: roots, anchor: rail, connection: 'nearest', colliders: [0], settings: settingsOf(values) }],
    }),
    tuning: (values) => ({ swatch: settingsOf(values) }),
    animate: ({ time }) => {
      rail.rotation.y = Math.sin(time * 0.8) * 0.35;
      ball.position.set(Math.sin(time * 0.9) * 0.55, 1.05 + Math.sin(time * 1.8) * 0.08, 0.12 + Math.cos(time * 0.9) * 0.1);
    },
  };
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  return {
    gravity: readNumber({ values, key: 'gravity', fallback: 5 }),
    damping: readNumber({ values, key: 'damping', fallback: 0.06 }),
    radius: 0.018,
    stiffness: [1, readNumber({ values, key: 'stiffness', fallback: 0.6 })],
    bendingStiffness: readNumber({ values, key: 'bending', fallback: 0.5 }),
    collision: { mode: 'edge', friction: 0.15 },
  };
}
