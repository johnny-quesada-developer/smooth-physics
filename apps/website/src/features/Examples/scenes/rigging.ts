import * as THREE from 'three';
import type { CollisionInput } from 'smooth-physics';

export type Offset = readonly [number, number, number];

// Friction belongs to collisions that are on; with collisions off the group takes no friction.
export const collisionOf = ({ mode, friction }: { mode: 'off' | 'point' | 'edge'; friction: number }): CollisionInput =>
  mode === 'off' ? { mode } : { mode, friction };

export function addChain({
  parent,
  origin,
  links,
  step,
}: {
  parent: THREE.Object3D;
  origin: Offset;
  links: number;
  step: (link: number) => Offset;
}): THREE.Bone {
  const first = new THREE.Bone();
  first.position.set(origin[0], origin[1], origin[2]);
  parent.add(first);
  let previous = first;
  for (let link = 1; link < links; link++) {
    const next = new THREE.Bone();
    const [x, y, z] = step(link);
    next.position.set(x, y, z);
    previous.add(next);
    previous = next;
  }
  return first;
}

export const straightDown =
  (length: number): ((link: number) => Offset) =>
  () => [0, -length, 0];
