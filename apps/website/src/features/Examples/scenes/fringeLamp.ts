import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { readFlag, readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition } from '@/features/Stage/runtime/types';
import { addChain, straightDown } from './rigging';

const STRANDS = 28;

export function createFringeLampScene(): SceneDefinition {
  const root = new THREE.Group(),
    pivot = new THREE.Group(),
    lamp = new THREE.Group();
  pivot.position.y = 2.3;
  lamp.position.y = -0.75;
  root.add(pivot);
  pivot.add(lamp);
  const cord = createProp({ geometry: new THREE.CylinderGeometry(0.006, 0.006, 0.75, 8), color: 'ink' });
  cord.position.y = -0.375;
  pivot.add(cord);
  const shade = createProp({ geometry: new THREE.CylinderGeometry(0.16, 0.3, 0.2, 40, 1, true), color: 'honey', roughness: 0.5 });
  const rim = createProp({ geometry: new THREE.TorusGeometry(0.3, 0.012, 8, 48), color: 'ink', metalness: 0.6 });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.1;
  lamp.add(shade, rim);
  const roots = Array.from({ length: STRANDS }, (_, index) => {
    const angle = (index / STRANDS) * Math.PI * 2;
    return addChain({ parent: lamp, origin: [Math.sin(angle) * 0.3, -0.1, Math.cos(angle) * 0.3], links: 7 + (index % 3), step: straightDown(0.05) });
  });
  let offset = 0;
  return {
    root,
    camera: { target: [0, 1.35, 0], distance: 2.3, height: 1.5 },
    styles: { fringe: { color: 'lime', width: 0.018 } },
    setup: (values) => ({ colliders: [], cloths: [{ name: 'fringe', bones: roots, anchor: lamp, connection: 'chains', settings: settingsOf(values) }] }),
    tuning: (values) => ({ fringe: settingsOf(values) }),
    animate: ({ values, time, deltaTime }) => {
      const spin = readNumber({ values, key: 'spin', fallback: 2 });
      pivot.position.x = offset;
      pivot.rotation.z = Math.sin(time * 1.6) * 0.3;
      pivot.rotation.x = Math.sin(time * 1.1) * 0.12;
      lamp.rotation.y += spin * deltaTime;
    },
    // Jumps the lamp sideways; with teleport set to reset, the fringe restarts in place instead of flying.
    act: ({ action }) => {
      if (action === 'teleport') offset = offset === 0 ? 0.9 : 0;
    },
  };
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  return {
    gravity: 6,
    damping: 0.05,
    radius: 0.01,
    stiffness: [1, 0.4],
    inertia: {
      world: readNumber({ values, key: 'worldInertia', fallback: 1 }),
      local: readNumber({ values, key: 'localInertia', fallback: 1 }),
      teleport: { mode: 'reset', distance: 0.5 },
    },
    angleLimit: readFlag({ values, key: 'angleLimit', fallback: true }) ? { degrees: [0, 50] } : { enabled: false },
  };
}
