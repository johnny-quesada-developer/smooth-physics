import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { readChoice, readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition } from '@/features/Stage/runtime/types';
import { addChain, collisionOf, straightDown } from './rigging';

const CONTACTS = ['edge', 'point', 'off'] as const;

export function createCurtainScene(): SceneDefinition {
  const root = new THREE.Group(),
    rail = new THREE.Group(),
    pusher = new THREE.Group();
  rail.position.y = 1.85;
  root.add(rail, pusher);
  const rod = createProp({ geometry: new THREE.CylinderGeometry(0.018, 0.018, 1.7, 12), color: 'line', metalness: 0.5 });
  rod.rotation.z = Math.PI / 2;
  rail.add(rod);
  const bar = createProp({ geometry: new THREE.CapsuleGeometry(0.08, 0.5, 6, 16), color: 'stone', roughness: 0.35 });
  bar.rotation.z = Math.PI / 2;
  pusher.add(bar);
  const roots = Array.from({ length: 16 }, (_, index) =>
    addChain({ parent: rail, origin: [-0.75 + index * 0.1, 0, (index % 2) * 0.025], links: 12, step: straightDown(0.085) }),
  );
  return {
    root,
    camera: { target: [0, 1.25, 0], distance: 2.9, height: 1.4, azimuth: 0.35 },
    grabbable: [pusher],
    styles: { curtain: { color: 'honey' } },
    setup: (values) => ({
      colliders: [{ object: pusher, shape: 'capsule', radius: 0.08, length: 0.66, axis: 'x' }],
      cloths: [{ name: 'curtain', bones: roots, anchor: rail, connection: 'nearest', colliders: [0], settings: settingsOf(values) }],
    }),
    tuning: (values) => ({ curtain: settingsOf(values) }),
    animate: ({ values, time, cloth }) => {
      pusher.position.set(Math.sin(time * 0.7) * 0.5, 1.2, 0.05 + Math.sin(time * 1.4) * 0.3);
      const gust = 0.55 + 0.45 * Math.sin(time * 1.7) * Math.sin(time * 0.43);
      const wind = readNumber({ values, key: 'wind', fallback: 6 }) * gust;
      cloth.addForce({ force: [wind * 0.25, 0, -wind] });
    },
  };
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  return {
    gravity: readNumber({ values, key: 'gravity', fallback: 5 }),
    damping: 0.06,
    radius: 0.02,
    stiffness: [1, readNumber({ values, key: 'stiffness', fallback: 0.5 })],
    bendingStiffness: readNumber({ values, key: 'bending', fallback: 0.8 }),
    collision: collisionOf({ mode: readChoice({ values, key: 'contact', choices: CONTACTS, fallback: 'edge' }), friction: 0.2 }),
  };
}
