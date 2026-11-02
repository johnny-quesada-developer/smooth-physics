import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { readFlag, readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition } from '@/features/Stage/runtime/types';
import { addChain, straightDown } from './rigging';

export function createHangingChainsScene(): SceneDefinition {
  const root = new THREE.Group(),
    bar = new THREE.Group(),
    ball = new THREE.Group();
  bar.position.y = 1.6;
  root.add(bar, ball);
  const rod = createProp({ geometry: new THREE.CylinderGeometry(0.015, 0.015, 1.5, 12), color: 'line', metalness: 0.5 });
  rod.rotation.z = Math.PI / 2;
  bar.add(rod);
  ball.add(createProp({ geometry: new THREE.SphereGeometry(0.12, 32, 20), color: 'stone', roughness: 0.3 }));
  const roots = Array.from({ length: 13 }, (_, index) =>
    addChain({ parent: bar, origin: [-0.66 + index * 0.11, 0, 0], links: 6 + (index % 5) * 2, step: straightDown(0.06) }),
  );
  return {
    root,
    camera: { target: [0, 1.15, 0], distance: 2.7, height: 1.35 },
    grabbable: [ball],
    styles: { chains: { color: 'sage', width: 0.025 } },
    setup: (values) => ({
      colliders: [{ object: ball, shape: 'sphere', radius: 0.12 }],
      cloths: [{ name: 'chains', bones: roots, anchor: bar, connection: 'chains', colliders: [0], settings: settingsOf(values) }],
    }),
    tuning: (values) => ({ chains: settingsOf(values) }),
    animate: ({ values, time }) => {
      bar.rotation.z = Math.sin(time * 0.9) * 0.22;
      // Switched off, the ball leaves the stage instead of rebuilding the cloth.
      const visible = readFlag({ values, key: 'ball', fallback: true });
      ball.visible = visible;
      ball.position.set(Math.sin(time * 1.3) * 0.75, visible ? 1.12 + Math.sin(time * 2.1) * 0.12 : -10, 0.05 + Math.cos(time * 1.3) * 0.08);
    },
    act: ({ action, cloth }) => {
      if (action === 'push') cloth.addForce({ force: [0, 2, 9] });
    },
  };
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  return {
    gravity: readNumber({ values, key: 'gravity', fallback: 5 }),
    damping: readNumber({ values, key: 'damping', fallback: 0.05 }),
    radius: 0.015,
    stiffness: [1, readNumber({ values, key: 'stiffness', fallback: 0.5 })],
  };
}
