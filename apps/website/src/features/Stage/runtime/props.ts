import * as THREE from 'three';
import type { StagePalette } from './themeColors';

export type PropColor = keyof StagePalette;

const PROP_COLORS: readonly PropColor[] = ['lime', 'honey', 'sage', 'stone', 'ink', 'line', 'focus'];

export function createProp({
  geometry,
  color,
  roughness = 0.4,
  metalness = 0.1,
}: {
  geometry: THREE.BufferGeometry;
  color: PropColor;
  roughness?: number;
  metalness?: number;
}): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ roughness, metalness }));
  mesh.userData['stageColor'] = color;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function paintProps({ root, palette }: { root: THREE.Object3D; palette: StagePalette }): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const token: unknown = object.userData['stageColor'];
    const color = PROP_COLORS.find((candidate) => candidate === token);
    if (color) object.material.color.set(palette[color]);
  });
}
