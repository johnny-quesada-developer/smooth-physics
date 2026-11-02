import * as THREE from 'three';
import type { SimulatedCloth } from 'smooth-physics';
import type { ThreeClothAdapter } from 'smooth-physics/three';
import type { StagePalette } from './themeColors';
import type { ClothStyle } from './types';

type ClothDrawing = {
  readonly simulation: SimulatedCloth;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly positions: THREE.BufferAttribute;
  readonly nodes: readonly THREE.Object3D[];
  // Chains of particle indices, root first; null for a surface.
  readonly chains: readonly (readonly number[])[] | null;
  readonly style: ClothStyle;
};

const DEFAULT_STYLE: ClothStyle = { color: 'sage' };
// A little of the cloth's own color as emission keeps folds in shadow pastel instead of muddy.
const EMISSION = 0.18;
const worldPosition = new THREE.Vector3();
const side = new THREE.Vector3();

export default class ClothSurfaces {
  readonly group = new THREE.Group();
  private readonly drawings: ClothDrawing[] = [];

  constructor({ cloth, styles, palette }: { cloth: ThreeClothAdapter; styles: Readonly<Record<string, ClothStyle>>; palette: StagePalette }) {
    for (const simulation of cloth.simulations) {
      const nodes = simulation.mesh.transformIds.flatMap((id) => cloth.nodes.get(id) ?? []);
      if (nodes.length !== simulation.particleCount) continue;
      const style = styles[simulation.name] ?? DEFAULT_STYLE;
      const surface = simulation.mesh.triangles.length > 0;
      const chains = surface ? null : chainsOf(nodes);
      const vertexCount = chains ? chains.reduce((sum, chain) => sum + chain.length * 2, 0) : simulation.particleCount;
      const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', positions);
      geometry.setIndex(chains ? stripIndices(chains) : simulation.mesh.triangles.flat());
      const material = new THREE.MeshStandardMaterial({ color: palette[style.color], roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
      material.emissive.set(palette[style.color]).multiplyScalar(EMISSION);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = style.receiveShadow ?? true;
      this.group.add(mesh);
      this.drawings.push({ simulation, mesh, positions, nodes, chains, style });
    }
  }

  // After cloth.update(): the bones already hold this frame's simulated pose.
  update(): void {
    for (const drawing of this.drawings) {
      drawing.mesh.visible = drawing.simulation.enabled;
      if (drawing.chains) writeRibbons({ drawing, chains: drawing.chains });
      else writeSurface(drawing);
      drawing.positions.needsUpdate = true;
      drawing.mesh.geometry.computeVertexNormals();
    }
  }

  setPalette(palette: StagePalette): void {
    for (const drawing of this.drawings) {
      drawing.mesh.material.color.set(palette[drawing.style.color]);
      drawing.mesh.material.emissive.set(palette[drawing.style.color]).multiplyScalar(EMISSION);
    }
  }

  dispose(): void {
    for (const drawing of this.drawings) {
      drawing.mesh.geometry.dispose();
      drawing.mesh.material.dispose();
    }
    this.group.removeFromParent();
  }
}

// Line chains, root first, following parent links inside the simulation.
function chainsOf(nodes: readonly THREE.Object3D[]): number[][] {
  const indexOf = new Map(nodes.map((node, vertex) => [node, vertex]));
  const chains: number[][] = [];
  nodes.forEach((node, vertex) => {
    if (node.parent && indexOf.has(node.parent)) return;
    const chain = [vertex];
    for (let current = node, next = nextLink({ node: current, indexOf }); next; current = next.node, next = nextLink({ node: current, indexOf })) {
      chain.push(next.vertex);
    }
    if (chain.length > 1) chains.push(chain);
  });
  return chains;
}

function nextLink({ node, indexOf }: { node: THREE.Object3D; indexOf: ReadonlyMap<THREE.Object3D, number> }): { node: THREE.Object3D; vertex: number } | null {
  for (const child of node.children) {
    const vertex = indexOf.get(child);
    if (vertex !== undefined) return { node: child, vertex };
  }
  return null;
}

function stripIndices(chains: readonly (readonly number[])[]): number[] {
  const indices: number[] = [];
  let base = 0;
  for (const chain of chains) {
    for (let link = 0; link < chain.length - 1; link++) {
      const left = base + link * 2;
      indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
    }
    base += chain.length * 2;
  }
  return indices;
}

function writeSurface(drawing: ClothDrawing): void {
  drawing.nodes.forEach((node, vertex) => {
    node.getWorldPosition(worldPosition);
    drawing.positions.setXYZ(vertex, worldPosition.x, worldPosition.y, worldPosition.z);
  });
}

// Each particle becomes two vertices, half a width either side of its bone's X axis.
function writeRibbons({ drawing, chains }: { drawing: ClothDrawing; chains: readonly (readonly number[])[] }): void {
  const halfWidth = (drawing.style.width ?? 0.03) / 2;
  let vertex = 0;
  for (const chain of chains) {
    for (const particle of chain) {
      const node = drawing.nodes[particle];
      if (!node) continue;
      node.getWorldPosition(worldPosition);
      side.setFromMatrixColumn(node.matrixWorld, 0).normalize().multiplyScalar(halfWidth);
      drawing.positions.setXYZ(vertex++, worldPosition.x - side.x, worldPosition.y - side.y, worldPosition.z - side.z);
      drawing.positions.setXYZ(vertex++, worldPosition.x + side.x, worldPosition.y + side.y, worldPosition.z + side.z);
    }
  }
}
