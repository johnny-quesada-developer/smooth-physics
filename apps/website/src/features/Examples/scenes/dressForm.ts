import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import type { ThreeColliderSpec } from 'smooth-physics/three';
import { readChoice } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ControlValues, SceneDefinition } from '@/features/Stage/runtime/types';
import { addChain, collisionOf } from './rigging';

const MOTIONS = ['walk', 'twirl', 'still'] as const;
const RATES = ['60', '90', '120'] as const;
const CONTACTS = ['edge', 'point', 'off'] as const;
const COLUMNS = 20;
const ROWS = 7;

type Leg = { readonly hip: THREE.Group; readonly knee: THREE.Group };

export function createDressFormScene(): SceneDefinition {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    hips = new THREE.Group();
  body.position.y = 0.95;
  root.add(body);
  body.add(hips);
  const torso = createProp({ geometry: new THREE.CapsuleGeometry(0.15, 0.38, 8, 20), color: 'line', roughness: 0.6 });
  torso.position.y = 0.32;
  const pelvis = createProp({ geometry: new THREE.CapsuleGeometry(0.13, 0.12, 8, 20), color: 'line', roughness: 0.6 });
  pelvis.rotation.z = Math.PI / 2;
  hips.add(torso, pelvis);
  const legs = [createLeg({ hips, side: -1 }), createLeg({ hips, side: 1 })];
  const roots = Array.from({ length: COLUMNS }, (_, column) => {
    const angle = (column / COLUMNS) * Math.PI * 2;
    const outward = (link: number): readonly [number, number, number] => {
      const flare = 0.018 + link * 0.004;
      return [Math.sin(angle) * flare, -0.075, Math.cos(angle) * flare];
    };
    return addChain({ parent: hips, origin: [Math.sin(angle) * 0.17, -0.02, Math.cos(angle) * 0.17], links: ROWS, step: outward });
  });
  const colliders: ThreeColliderSpec[] = [
    { object: hips, shape: 'capsule', radius: 0.14, length: 0.3, axis: 'x' },
    ...legs.flatMap((leg): ThreeColliderSpec[] => [
      { object: leg.hip, shape: 'capsule', radius: 0.075, endRadius: 0.06, length: 0.42, center: [0, -0.21, 0] },
      { object: leg.knee, shape: 'capsule', radius: 0.06, endRadius: 0.045, length: 0.42, center: [0, -0.21, 0] },
    ]),
  ];
  return {
    root,
    camera: { target: [0, 0.75, 0], distance: 2.5, height: 1.05, azimuth: 0.5 },
    styles: { robe: { color: 'lime' } },
    setup: (values) => ({
      colliders,
      cloths: [{ name: 'robe', bones: roots, anchor: hips, connection: 'ring', colliders: colliders.map((_, index) => index), settings: settingsOf(values) }],
    }),
    tuning: (values) => ({ robe: settingsOf(values) }),
    configure: ({ values, cloth }) => {
      cloth.system.setFrequency(Number(readChoice({ values, key: 'rate', choices: RATES, fallback: '90' })));
    },
    animate: ({ values, time }) => {
      const motion = readChoice({ values, key: 'motion', choices: MOTIONS, fallback: 'walk' });
      animateBody({ motion, time, body, hips, legs });
    },
  };
}

function createLeg({ hips, side }: { hips: THREE.Group; side: number }): Leg {
  const hip = new THREE.Group(),
    knee = new THREE.Group();
  hip.position.set(side * 0.09, -0.04, 0);
  knee.position.y = -0.42;
  hips.add(hip);
  hip.add(knee);
  const thigh = createProp({ geometry: new THREE.CapsuleGeometry(0.07, 0.3, 6, 16), color: 'line', roughness: 0.6 });
  thigh.position.y = -0.21;
  const shin = createProp({ geometry: new THREE.CapsuleGeometry(0.055, 0.32, 6, 16), color: 'line', roughness: 0.6 });
  shin.position.y = -0.21;
  hip.add(thigh);
  knee.add(shin);
  return { hip, knee };
}

function animateBody({
  motion,
  time,
  body,
  hips,
  legs,
}: {
  motion: (typeof MOTIONS)[number];
  time: number;
  body: THREE.Group;
  hips: THREE.Group;
  legs: readonly Leg[];
}): void {
  const stride = motion === 'walk' ? 0.55 : 0;
  legs.forEach((leg, index) => {
    const phase = time * 5.2 + index * Math.PI;
    leg.hip.rotation.x = Math.sin(phase) * stride;
    leg.knee.rotation.x = Math.max(0, -Math.cos(phase)) * stride * 1.3;
  });
  body.position.y = 0.95 + (motion === 'walk' ? Math.abs(Math.sin(time * 5.2)) * 0.03 : 0);
  body.position.x = motion === 'walk' ? Math.sin(time * 0.6) * 0.35 : 0;
  hips.rotation.y = motion === 'twirl' ? time * 4.5 : motion === 'walk' ? Math.sin(time * 5.2) * 0.12 : 0;
}

function settingsOf(values: ControlValues): ClothSettingsInput {
  return {
    gravity: 5,
    damping: 0.04,
    radius: 0.02,
    stiffness: [1, 0.6],
    restoration: { stiffness: [0.25, 0.05] },
    collision: collisionOf({ mode: readChoice({ values, key: 'contact', choices: CONTACTS, fallback: 'edge' }), friction: 0.1 }),
  };
}
