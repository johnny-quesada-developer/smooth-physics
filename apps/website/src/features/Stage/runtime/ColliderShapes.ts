import * as THREE from 'three';
import type { ThreeColliderSpec } from 'smooth-physics/three';

type Shape = { readonly mesh: THREE.Mesh; readonly object: THREE.Object3D };

export default class ColliderShapes {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
  private shapes: Shape[] = [];

  constructor({ color }: { color: string }) {
    this.material.color.set(color);
    this.group.visible = false;
  }

  replace(colliders: readonly ThreeColliderSpec[]): void {
    for (const child of this.group.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
    this.group.clear();
    this.shapes = colliders.map((collider) => ({ mesh: shapeOf({ collider, material: this.material }), object: collider.object }));
    for (const { mesh } of this.shapes) this.group.add(mesh);
  }

  // Before drawing. The shapes live in a group of their own, so hiding a collider's object, such as a fighter off the
  // stage, does not hide its shape.
  update(): void {
    for (const { mesh, object } of this.shapes) mesh.visible = isShown(object);
  }

  setColor(color: string): void {
    this.material.color.set(color);
  }

  dispose(): void {
    this.replace([]);
    this.material.dispose();
    this.group.removeFromParent();
  }
}

function isShown(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

// The library measures a capsule's length from tip to tip, and its segment runs between the centres of its two end
// caps, exactly as the solver places them (centred on the object, or starting at it with align: 'start').
function capsuleGeometry(collider: Extract<ThreeColliderSpec, { shape: 'capsule' }>): THREE.BufferGeometry {
  const startRadius = collider.radius;
  const endRadius = collider.endRadius ?? collider.radius;
  const centred = (collider.align ?? 'center') === 'center';
  const start = centred ? -Math.max(collider.length / 2 - startRadius, 0) : 0;
  const end = centred ? Math.max(collider.length / 2 - endRadius, 0) : Math.max(collider.length - startRadius - endRadius, 0);
  const profile: THREE.Vector2[] = [];
  const capSteps = 8;
  for (let step = 0; step <= capSteps; step++) {
    const angle = -Math.PI / 2 + (step / capSteps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(startRadius * Math.cos(angle), start + startRadius * Math.sin(angle)));
  }
  for (let step = 0; step <= capSteps; step++) {
    const angle = (step / capSteps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(endRadius * Math.cos(angle), end + endRadius * Math.sin(angle)));
  }
  const geometry = new THREE.LatheGeometry(profile, 16);
  // A reversed capsule has its start cap at the far end of its axis.
  if (collider.reverse) geometry.scale(1, -1, 1);
  return geometry;
}

function shapeOf({ collider, material }: { collider: ThreeColliderSpec; material: THREE.Material }): THREE.Mesh {
  const geometry = collider.shape === 'sphere' ? new THREE.SphereGeometry(collider.radius, 16, 10) : capsuleGeometry(collider);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 10;
  // The mesh is placed on its collider right before drawing, so its own position says nothing about visibility.
  mesh.frustumCulled = false;
  const axis = collider.shape === 'capsule' ? (collider.axis ?? 'y') : 'y';
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  const [x, y, z] = collider.center ?? [0, 0, 0];
  mesh.position.set(x, y, z);
  mesh.updateMatrix();
  const local = mesh.matrix.clone();
  mesh.matrixAutoUpdate = false;
  // The group sits at the origin; the shape is placed on its collider's object right before it is drawn.
  mesh.onBeforeRender = () => {
    mesh.matrixWorld.multiplyMatrices(collider.object.matrixWorld, local);
  };
  return mesh;
}
