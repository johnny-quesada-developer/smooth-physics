import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import { addChain, straightDown } from '@/features/Examples/scenes/rigging';
import { createProp } from '@/features/Stage/runtime/props';
import type { SceneDefinition } from '@/features/Stage/runtime/types';

const BANNER: ClothSettingsInput = {
  gravity: 5,
  damping: 0.06,
  radius: 0.02,
  stiffness: [1, 0.55],
  bendingStiffness: 0.7,
  collision: { mode: 'edge', friction: 0.15 },
};
const TASSELS: ClothSettingsInput = { gravity: 6, damping: 0.05, radius: 0.012, stiffness: [1, 0.4] };

export function createHeroScene(): SceneDefinition {
  const root = new THREE.Group(),
    rail = new THREE.Group(),
    orb = new THREE.Group();
  rail.position.y = 1.95;
  root.add(rail, orb);
  const rod = createProp({ geometry: new THREE.CylinderGeometry(0.02, 0.02, 2.5, 16), color: 'ink', metalness: 0.6, roughness: 0.3 });
  rod.rotation.z = Math.PI / 2;
  rail.add(rod);
  const ball = createProp({ geometry: new THREE.SphereGeometry(0.17, 40, 24), color: 'stone', roughness: 0.3, metalness: 0.05 });
  orb.add(ball);
  const banner = Array.from({ length: 22 }, (_, index) =>
    addChain({ parent: rail, origin: [-1.05 + index * 0.1, 0, (index % 2) * 0.02], links: 13, step: straightDown(0.085) }),
  );
  const tassels = [-1.18, -1.13, 1.13, 1.18].map((x, index) =>
    addChain({ parent: rail, origin: [x, 0, 0], links: 9 + (index % 2) * 3, step: straightDown(0.06) }),
  );
  return {
    root,
    camera: { target: [0, 1.25, 0], distance: 3.6, height: 1.45, azimuth: 0.28 },
    grabbable: [orb],
    // A held ball stays just in front of the rail, so it presses into the banner without cutting through it.
    grabPlane: { normal: [0, 0, 1], minimum: 0.05 },
    // The ball moves inside the fabric: its shadow belongs on the floor, not on the dent it makes.
    styles: { banner: { color: 'lime', receiveShadow: false }, tassels: { color: 'honey', width: 0.022, receiveShadow: false } },
    setup: () => ({
      colliders: [{ object: orb, shape: 'sphere', radius: 0.17 }],
      cloths: [
        { name: 'banner', bones: banner, anchor: rail, connection: 'nearest', colliders: [0], settings: BANNER },
        { name: 'tassels', bones: tassels, anchor: rail, connection: 'chains', settings: TASSELS },
      ],
    }),
    animate: ({ time, cloth }) => {
      // The ball presses in from the front: it grazes the banner at the ends and sinks a deep pocket into the middle.
      // It starts at an end, so it never begins behind the fabric.
      const sweep = time * 0.55 + Math.PI / 2,
        depth = Math.cos(sweep);
      orb.position.set(Math.sin(sweep) * 0.95, 1.3 + Math.sin(time * 1.1) * 0.2, 0.18 - 0.43 * depth * depth);
      rail.rotation.z = Math.sin(time * 0.4) * 0.04;
      const gust = 2.5 + 2.5 * Math.sin(time * 0.9) * Math.sin(time * 0.31);
      cloth.addForce({ force: [gust * 0.3, 0, -gust] });
    },
  };
}
