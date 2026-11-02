import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import type { ThreeClothSpec } from 'smooth-physics/three';
import { readChoice, readFlag, readNumber } from '@/features/Stage/runtime/controlValues';
import { createProp } from '@/features/Stage/runtime/props';
import type { ClothStyle, SceneDefinition, ThreadColor } from '@/features/Stage/runtime/types';
import { addChain, straightDown } from './rigging';

const PRECISIONS = ['default', 'rounded'] as const;
const COLORS: readonly ThreadColor[] = ['lime', 'honey', 'sage', 'stone'];
const MAXIMUM_FLAGS = 48;
const SETTINGS: ClothSettingsInput = { gravity: 5, damping: 0.05, radius: 0.015, stiffness: [1, 0.5], bendingStiffness: 0.6, collision: { mode: 'off' } };

type Flag = { readonly stand: THREE.Group; readonly roots: readonly THREE.Bone[] };

export function createBannerFieldScene(): SceneDefinition {
  const root = new THREE.Group();
  const flags = Array.from({ length: MAXIMUM_FLAGS }, (_, index) => createFlag({ root, index }));
  const styles: Record<string, ClothStyle> = {};
  flags.forEach((_, index) => {
    styles[`flag${index}`] = { color: COLORS[index % COLORS.length] ?? 'lime' };
  });
  return {
    root,
    camera: { target: [0, 0.7, -1.2], distance: 5.2, height: 2.4 },
    styles,
    setup: (values) => {
      const count = Math.round(readNumber({ values, key: 'count', fallback: 12 }));
      flags.forEach((flag, index) => {
        flag.stand.visible = index < count;
      });
      const cloths: ThreeClothSpec[] = flags
        .slice(0, count)
        .map((flag, index) => ({ name: `flag${index}`, bones: flag.roots, anchor: flag.stand, connection: 'nearest', settings: SETTINGS }));
      return { colliders: [], cloths };
    },
    configure: ({ values, cloth }) => {
      const system = cloth.system;
      system.setPrecision(readChoice({ values, key: 'precision', choices: PRECISIONS, fallback: 'default' }));
      system.autoRate.enabled = readFlag({ values, key: 'autoRate', fallback: true });
      system.autoRate.budgetMs = readNumber({ values, key: 'budget', fallback: 6 });
      system.autoRate.motionBoost.mode = 'free';
    },
    animate: ({ values, time, cloth }) => {
      flags.forEach((flag, index) => {
        flag.stand.rotation.y = Math.sin(time * 0.5 + index) * 0.4;
      });
      const wind = readNumber({ values, key: 'wind', fallback: 8 }) * (0.6 + 0.4 * Math.sin(time * 1.3));
      cloth.addForce({ force: [wind, 0, wind * 0.3] });
    },
  };
}

function createFlag({ root, index }: { root: THREE.Group; index: number }): Flag {
  const column = index % 8,
    row = Math.floor(index / 8);
  const stand = new THREE.Group(),
    pole = new THREE.Group();
  stand.position.set((column - 3.5) * 0.7, 0, -row * 0.75);
  pole.position.y = 1.2;
  root.add(stand);
  stand.add(pole);
  const staff = createProp({ geometry: new THREE.CylinderGeometry(0.01, 0.012, 1.2, 8), color: 'line', metalness: 0.4 });
  staff.position.y = 0.6;
  stand.add(staff);
  // The flag hangs from a short horizontal arm, so wind turns it like a banner.
  const roots = Array.from({ length: 6 }, (_, chain) => addChain({ parent: pole, origin: [0.02 + chain * 0.06, 0, 0], links: 5, step: straightDown(0.06) }));
  return { stand, roots };
}
