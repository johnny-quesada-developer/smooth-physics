// The three.js integration, imported from 'smooth-physics/three': cloth authored on three.js objects, and the adapter
// that reads them into a cloth system and writes the results back into the bones. The system is built in three.js
// coordinates ({ up: 'y', handedness: 'right' }) and the library converts them exactly. Poses, collider offsets and
// forces stay in three.js coordinates. three.js is passed in, so the library has no runtime dependency on it.
import type * as Three from 'three';
import {
  createClothScene,
  type CapsuleColliderSpec,
  type ClothConnection,
  type ClothSettingsInput,
  type ClothSpec,
  type ColliderSpec,
  type SphereColliderSpec,
  type TransformSpec,
} from './authoring.ts';
import { ClothSystem, type SystemOptions } from './cloth-system.ts';
import { SmoothPhysicsError } from './errors.ts';
import type { SimulatedCloth } from './simulated-cloth.ts';
import { isExcluded, isPinned, isSimulated } from './cloth-mesh/attributes.ts';
import type { ClothScene } from './scene-format/types.ts';
import type { ForceInput, Pose, PoseSource } from './cloth-state.ts';
import type { Quaternion } from './float32/quaternion.ts';
import type { Matrix4 } from './float32/matrix.ts';
import { unsetMatrix, unsetQuaternion, unsetVector, type Coordinates, type FrameKernels } from './coordinates.ts';
import type { Vector3 } from './float32/vector.ts';
import { parseInput, threeSceneSpecSchema } from './spec-schemas.ts';

export const THREE_COORDINATES: Coordinates = { up: 'y', handedness: 'right' };

type ColliderOf<Spec> = Omit<Spec, 'id' | 'transform'> & { readonly object: Three.Object3D };
export type ThreeColliderSpec = ColliderOf<SphereColliderSpec> | ColliderOf<CapsuleColliderSpec>;
export type ThreeClothSpec = {
  readonly name?: string;
  readonly bones: readonly Three.Object3D[];
  readonly anchor?: Three.Object3D;
  readonly connection?: ClothConnection;
  readonly fixed?: readonly Three.Object3D[];
  readonly exclude?: readonly Three.Object3D[];
  // Indices into ThreeSceneSpec.colliders.
  readonly colliders?: readonly number[];
  readonly settings?: ClothSettingsInput;
  readonly enabled?: boolean;
  readonly normals?: 'bone' | 'outward';
};
export type ThreeSceneSpec = { readonly cloths: readonly ThreeClothSpec[]; readonly colliders?: readonly ThreeColliderSpec[] };
// Objects that draw something are never cloth particles, even below a root bone.
const isRenderable = (node: Three.Object3D): boolean =>
  'isMesh' in node || 'isLine' in node || 'isPoints' in node || 'isSprite' in node || 'isLight' in node || 'isCamera' in node;

// Every non-drawing object below a root bone becomes a particle.
export function createThreeCloth({
  three,
  root,
  spec: input,
  options = {},
}: {
  three: ThreeModule;
  root: Three.Object3D;
  spec: ThreeSceneSpec;
  options?: SystemOptions;
}): ThreeClothAdapter {
  const spec: ThreeSceneSpec = parseInput({ schema: threeSceneSpecSchema, input, code: 'INVALID_CLOTH_SPEC' });
  root.updateMatrixWorld(true);

  const ids = new Map<Three.Object3D, number>();
  const nodes = new Map<number, Three.Object3D>();
  const transforms: TransformSpec[] = [];
  const position = new three.Vector3();
  const rotation = new three.Quaternion();
  const scale = new three.Vector3();
  const visit = (node: Three.Object3D, parent: number | undefined): void => {
    // Ids count from 1 in visit order: transform ids must be positive.
    const id = transforms.length + 1;
    ids.set(node, id);
    nodes.set(id, node);
    // The root keeps its world pose so the scene may sit anywhere; below it, local poses.
    if (parent) {
      position.copy(node.position);
      rotation.copy(node.quaternion);
      scale.copy(node.scale);
    } else node.matrixWorld.decompose(position, rotation, scale);
    transforms.push({
      id,
      name: node.name || `${node.type}${id}`,
      ...(parent ? { parent } : {}),
      position: position.toArray(),
      rotation: rotation.toArray(),
      scale: scale.toArray(),
    });
    for (const child of node.children) if (!isRenderable(child)) visit(child, id);
  };
  visit(root, undefined);

  const missing = (subject: string): never => {
    throw new SmoothPhysicsError({ code: 'INVALID_CLOTH_SPEC', message: `${subject} must be a non-drawing object inside the root.` });
  };

  const colliders: ColliderSpec[] = [];
  for (const [index, { object, ...collider }] of (spec.colliders ?? []).entries()) {
    const transform = ids.get(object);
    if (transform === undefined) return missing(`Collider object ${index}`);
    colliders.push({ ...collider, id: index, transform });
  }

  const cloths: ClothSpec[] = [];
  for (const [index, cloth] of spec.cloths.entries()) {
    const roots = cloth.bones.map((bone) => ids.get(bone));
    const anchor = ids.get(cloth.anchor ?? root);
    const fixed = cloth.fixed?.map((bone) => ids.get(bone));
    const exclude = cloth.exclude?.map((bone) => ids.get(bone));
    if (roots.some((id) => id === undefined) || anchor === undefined) return missing(`Cloth ${cloth.name ?? index} bone or anchor`);
    if (fixed?.some((id) => id === undefined) || exclude?.some((id) => id === undefined)) return missing(`Cloth ${cloth.name ?? index} fixed or excluded bone`);
    cloths.push({
      name: cloth.name ?? `cloth${index + 1}`,
      roots: definedIds(roots),
      anchor,
      ...(cloth.connection === undefined ? {} : { connection: cloth.connection }),
      ...(cloth.settings === undefined ? {} : { settings: cloth.settings }),
      ...(cloth.enabled === undefined ? {} : { enabled: cloth.enabled }),
      ...(cloth.normals === undefined ? {} : { normals: cloth.normals }),
      ...(fixed === undefined ? {} : { fixed: definedIds(fixed) }),
      ...(exclude === undefined ? {} : { exclude: definedIds(exclude) }),
      ...(cloth.colliders === undefined ? {} : { colliders: cloth.colliders }),
    });
  }

  const scene = createClothScene({ coordinates: THREE_COORDINATES, transforms, cloths, colliders });
  return ThreeClothAdapter.fromNodes({ three, nodes, scene, options });
}

function definedIds(values: readonly (number | undefined)[]): number[] {
  return values.filter((value): value is number => value !== undefined);
}

// Only the math classes the adapter constructs, so a worker can pass them without bundling all of three.js.
export type ThreeModule = Pick<typeof Three, 'Matrix4' | 'Quaternion' | 'Vector3'>;
type WrittenBone = { readonly node: Three.Object3D; readonly position: Three.Vector3; readonly quaternion: Three.Quaternion };
// Scratch for decomposing world matrices, shared by every pose: each pose converts what it keeps into its own arrays.
type Decomposed = {
  readonly position: Three.Vector3;
  readonly rotation: Three.Quaternion;
  readonly scale: Three.Vector3;
  readonly rotationValues: Quaternion;
  readonly scaleValues: Vector3;
};

export class ThreeClothAdapter {
  readonly system: ClothSystem;
  readonly nodes: ReadonlyMap<number, Three.Object3D>;
  enabled = true;
  private readonly written: WrittenBone[] = [];
  private readonly writtenBySimulation = new Map<SimulatedCloth, WrittenBone[]>();
  // One pose per transform, converted again in place in each frame that reads it.
  private readonly poses = new Map<number, SolverPose>();
  // Counts updates, so a pose read in an earlier frame converts again.
  private frame = 0;
  private readonly identity: Three.Matrix4;
  private readonly decomposed: Decomposed;
  private readonly scratch: {
    readonly position: Three.Vector3;
    readonly rotation: Three.Quaternion;
    readonly scale: Three.Vector3;
    readonly parentRotation: Three.Quaternion;
  };
  private readonly converted: { readonly vector: Vector3; readonly quaternion: Quaternion } = { vector: [0, 0, 0], quaternion: [0, 0, 0, 1] };
  private readonly plans = new Map<SimulatedCloth, WritePlan>();
  private readonly kernels: FrameKernels;
  private readonly readPose: PoseSource = (id) => {
    let pose = this.poses.get(id);
    if (!pose) {
      pose = new SolverPose({ world: this.identity, kernels: this.kernels, decomposed: this.decomposed });
      this.poses.set(id, pose);
    }
    if (pose.frame !== this.frame) pose.convert(this.nodes.get(id)?.matrixWorld ?? this.identity, this.frame);
    return pose;
  };

  private constructor({ three, system, nodes }: { three: ThreeModule; system: ClothSystem; nodes: ReadonlyMap<number, Three.Object3D> }) {
    this.system = system;
    this.nodes = nodes;
    this.kernels = system.axes.kernels;
    this.scratch = { position: new three.Vector3(), rotation: new three.Quaternion(), scale: new three.Vector3(), parentRotation: new three.Quaternion() };
    this.decomposed = {
      position: new three.Vector3(),
      rotation: new three.Quaternion(),
      scale: new three.Vector3(),
      rotationValues: unsetQuaternion(),
      scaleValues: unsetVector(),
    };
    this.identity = new three.Matrix4();
    // Rest local poses of written bones; the solver restores them before animation each frame.
    for (const simulation of system.simulations) {
      const bones: WrittenBone[] = [];
      simulation.mesh.transformIds.forEach((id, vertex) => {
        const node = nodes.get(id);
        if (!node || isExcluded(simulation.mesh.attributes[vertex])) return;
        bones.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone() });
      });
      this.writtenBySimulation.set(simulation, bones);
      this.written.push(...bones);
      this.plans.set(simulation, writePlan({ three, simulation, nodes }));
    }
  }

  static fromNodes({
    three,
    nodes,
    scene,
    options = {},
  }: {
    three: ThreeModule;
    nodes: ReadonlyMap<number, Three.Object3D>;
    scene: ClothScene;
    options?: SystemOptions;
  }): ThreeClothAdapter {
    for (const id of scene.transforms.keys())
      if (!nodes.has(id)) throw new SmoothPhysicsError({ code: 'MISSING_OBJECT', message: `Missing object for transform ${id}.` });
    return new ThreeClothAdapter({ three, system: ClothSystem.create({ scene, options }), nodes });
  }

  get simulations(): readonly SimulatedCloth[] {
    return this.system.simulations;
  }

  // Before the animation mixer.
  restore(): void {
    for (const bone of this.written) {
      bone.node.position.copy(bone.position);
      bone.node.quaternion.copy(bone.quaternion);
    }
  }

  setSimulationEnabled({ simulation, enabled }: { simulation: SimulatedCloth; enabled: boolean }): void {
    simulation.enabled = enabled;
    for (const bone of this.writtenBySimulation.get(simulation) ?? []) {
      bone.node.position.copy(bone.position);
      bone.node.quaternion.copy(bone.quaternion);
    }
    if (enabled) simulation.reset();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.restore();
    if (enabled) this.system.reset();
  }

  // A force in three.js world space.
  addForce(input: ForceInput): void {
    this.system.addForce(input);
  }

  // After the animation mixer and before rendering.
  update({ deltaTime, root }: { deltaTime: number; root: Three.Object3D }): void {
    if (!this.enabled) return;
    root.updateMatrixWorld(true);
    this.frame++;
    // The poses are converted as they are read, so the system takes them in its own coordinates.
    this.system.updateInSolverSpace({ frameDeltaTime: deltaTime, pose: this.readPose });
    for (const simulation of this.system.simulations) if (simulation.enabled && !simulation.skipWrite) this.writeSimulation(simulation);
    // Refresh world matrices so anything that reads bone positions after the physics sees the new pose, as a scene
    // graph with automatic transforms would.
    root.updateMatrixWorld(true);
  }

  // Particle positions in three.js world space, for drawing.
  particles(simulation: SimulatedCloth): readonly Vector3[] {
    return simulation.output.positions;
  }

  // Converts only what it writes, one bone at a time, rather than whole output arrays.
  private writeSimulation(simulation: SimulatedCloth): void {
    const plan = this.plans.get(simulation);
    if (!plan) return;
    const { vectorToUser, rotationToUser } = this.kernels;
    const { rotation, parentRotation, position, scale } = this.scratch;
    const { vector, quaternion } = this.converted;

    for (let vertex = 0; vertex < simulation.particleCount; vertex++) {
      const node = plan.nodes[vertex];
      if (!node) continue;
      if (plan.moving[vertex] && simulation.outputLocalValid[vertex]) {
        node.position.fromArray(vectorToUser(simulation.outputLocalPositions, vertex * 3, vector));
        node.quaternion.fromArray(rotationToUser(simulation.outputLocalRotations, vertex * 4, quaternion));
        continue;
      }

      // A fixed bone takes the solver's world rotation, made local to its parent. A fixed parent written earlier in
      // this loop has a stale world matrix until the next updateMatrixWorld, so its written rotation stands in.
      const writtenRotation = plan.fixedRotations[vertex];
      if (!writtenRotation) continue;
      rotation.fromArray(rotationToUser(simulation.outputRotations, vertex * 4, quaternion));
      const parent = node.parent;
      const writtenParentRotation = plan.fixedRotations[plan.fixedParent[vertex] ?? -1];
      if (writtenParentRotation) parentRotation.copy(writtenParentRotation);
      else if (parent) parent.matrixWorld.decompose(position, parentRotation, scale);
      else parentRotation.identity();
      writtenRotation.copy(rotation);
      node.quaternion.copy(parentRotation.invert().multiply(rotation));
    }
  }
}

// What writing a cloth back needs, worked out once: each particle's object, whether it moves, and for fixed bones the
// written rotation and the earlier fixed particle that is its parent. Particles are depth first, so a fixed parent is
// always written before its children.
type WritePlan = {
  readonly nodes: readonly (Three.Object3D | undefined)[];
  readonly moving: readonly boolean[];
  readonly fixedRotations: readonly (Three.Quaternion | undefined)[];
  readonly fixedParent: Int32Array;
};

function writePlan({ three, simulation, nodes }: { three: ThreeModule; simulation: SimulatedCloth; nodes: ReadonlyMap<number, Three.Object3D> }): WritePlan {
  const { transformIds, attributes } = simulation.mesh;
  const particleCount = simulation.particleCount;
  const particleNodes = Array.from({ length: particleCount }, (_, vertex) => nodes.get(transformIds[vertex] ?? 0));
  const fixed = particleNodes.map((node, vertex) => node !== undefined && isPinned(attributes[vertex] ?? 0));
  const fixedRotations = fixed.map((isFixedBone) => (isFixedBone ? new three.Quaternion() : undefined));

  // -1 where no fixed particle is the bone's parent.
  const fixedParent = new Int32Array(particleCount).fill(-1);
  const fixedVertexByNode = new Map<Three.Object3D, number>();
  particleNodes.forEach((node, vertex) => {
    if (!node || !fixed[vertex]) return;
    fixedParent[vertex] = node.parent ? (fixedVertexByNode.get(node.parent) ?? -1) : -1;
    fixedVertexByNode.set(node, vertex);
  });

  return {
    nodes: particleNodes,
    moving: particleNodes.map((node, vertex) => node !== undefined && isSimulated(attributes[vertex] ?? 0)),
    fixedRotations,
    fixedParent,
  };
}

// A three.js world matrix seen in the solver's coordinates. Rotation and scale are decomposed only when read.
class SolverPose implements Pose {
  readonly matrix: Matrix4 = unsetMatrix();
  readonly position: Vector3 = unsetVector();
  // The frame of the last conversion.
  frame = -1;
  private world: Three.Matrix4;
  private readonly kernels: FrameKernels;
  private readonly decomposed: Decomposed;
  private readonly solverRotation: Quaternion = unsetQuaternion();
  private readonly solverScale: Vector3 = unsetVector();
  private isDecomposed = false;

  constructor({ world, kernels, decomposed }: { world: Three.Matrix4; kernels: FrameKernels; decomposed: Decomposed }) {
    this.world = world;
    this.kernels = kernels;
    this.decomposed = decomposed;
  }

  convert(world: Three.Matrix4, frame: number): void {
    this.world = world;
    this.frame = frame;
    this.isDecomposed = false;
    const matrix = this.kernels.matrix(world.elements, this.matrix);
    // The translation column converts like a position.
    const position = this.position;
    position[0] = matrix[12];
    position[1] = matrix[13];
    position[2] = matrix[14];
  }

  get rotation(): Quaternion {
    if (!this.isDecomposed) this.decompose();
    return this.solverRotation;
  }

  get scale(): Vector3 {
    if (!this.isDecomposed) this.decompose();
    return this.solverScale;
  }

  // The components are copied one by one rather than with toArray: its store is shared with every other caller of
  // three.js, and V8 boxes each number it stores there.
  private decompose(): void {
    const { position, rotation, scale, rotationValues, scaleValues } = this.decomposed;
    this.world.decompose(position, rotation, scale);
    rotationValues[0] = rotation.x;
    rotationValues[1] = rotation.y;
    rotationValues[2] = rotation.z;
    rotationValues[3] = rotation.w;
    scaleValues[0] = scale.x;
    scaleValues[1] = scale.y;
    scaleValues[2] = scale.z;
    this.kernels.rotation(rotationValues, this.solverRotation);
    this.kernels.scale(scaleValues, this.solverScale);
    this.isDecomposed = true;
  }
}
