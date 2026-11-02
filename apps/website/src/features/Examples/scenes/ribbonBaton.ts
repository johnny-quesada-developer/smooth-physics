import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition } from '@/features/Stage/runtime/types';
import { addChain } from './rigging';

export function createRibbonBatonScene(): SceneDefinition {
  const root = new THREE.Group(),
    holder = new THREE.Group(),
    baton = new THREE.Group();
  holder.position.set(0, 1.35, 0);
  root.add(holder);
  holder.add(baton);
  const stick = createProp({ geometry: new THREE.CapsuleGeometry(0.02, 0.6, 6, 12), color: 'ink', metalness: 0.4 });
  stick.rotation.z = Math.PI / 2;
  baton.add(stick);
  const trail = (link: number): readonly [number, number, number] => [0, -0.07, -0.004 * link];
  const roots = [-0.32, 0.32, 0].map((x, index) => addChain({ parent: baton, origin: [x, 0, 0], links: index === 2 ? 16 : 12, step: trail }));
  return {
    root,
    camera: { target: [0, 1.0, 0], distance: 2.8, height: 1.3 },
    styles: { ribbons: { color: 'honey', width: 0.05 } },
    setup: (values) => ({ colliders: [], cloths: [{ name: 'ribbons', bones: roots, anchor: baton, connection: 'chains', settings: settingsOf(values) }] }),
    tuning: (values) => ({ ribbons: settingsOf(values) }),
    animate: ({ values, time, deltaTime }) => {
      const speed = readNumber({ values, key: 'twirl', fallback: 4 });
      baton.rotation.z += speed * deltaTime;
      holder.position.x = Math.sin(time * 0.8) * 0.4;
      holder.position.y = 1.35 + Math.sin(time * 1.6) * 0.1;
    },
  };
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  const restoration = readNumber({ values, key: 'restoration', fallback: 0.2 });
  const maxDistance = readNumber({ values, key: 'maxDistance', fallback: 0 });
  return {
    gravity: readNumber({ values, key: 'gravity', fallback: 4 }),
    damping: 0.04,
    radius: 0.015,
    stiffness: [1, 0.7],
    restoration: restoration > 0 ? { stiffness: [restoration, restoration * 0.2] } : { enabled: false },
    maxDistance: maxDistance > 0 ? { distance: maxDistance } : { enabled: false },
  };
}
