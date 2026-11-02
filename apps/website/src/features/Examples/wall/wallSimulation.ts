import { ClothSystem, createClothScene, type Pose, type TransformSpec } from 'smooth-physics';
import { THREE_COORDINATES } from 'smooth-physics/three';
import { composeMatrix, multiplyMatrices } from 'smooth-physics/float32/matrix';
import { axisAngle, multiplyQuaternions, normalizeQuaternion } from 'smooth-physics/float32/quaternion';
import { multiplyVectors } from 'smooth-physics/float32/vector';

export type WallSpec = { readonly chains: number; readonly links: number };
export type WallStep = { readonly deltaTime: number; readonly time: number };
// positions: every chain root first, three numbers per particle, then the ball center.
export type WallFrame = { readonly positions: Float32Array; readonly physicsMilliseconds: number };

const BAR = 1;
const BALL = 2;
const SPACING = 0.035;
const LINK = 0.055;

// Everything here is in three.js coordinates: the scene says so, and the library converts.
export default class WallSimulation {
  readonly spec: WallSpec;
  private readonly system: ClothSystem;
  private readonly transforms: ReadonlyMap<number, TransformSpec>;
  private readonly order: readonly number[];
  private readonly poses = new Map<number, Pose>();
  private bar: Pose = restPose([0, 1.9, 0]);
  private ball: Pose = restPose([0, 1.2, 0.3]);

  private constructor({
    spec,
    system,
    transforms,
    order,
  }: {
    spec: WallSpec;
    system: ClothSystem;
    transforms: ReadonlyMap<number, TransformSpec>;
    order: readonly number[];
  }) {
    this.spec = spec;
    this.system = system;
    this.transforms = transforms;
    this.order = order;
  }

  // Throws SmoothPhysicsError when the scene cannot be built.
  static create(spec: WallSpec): WallSimulation {
    const transforms: TransformSpec[] = [
      { id: BAR, name: 'bar' },
      { id: BALL, name: 'ball' },
    ];
    const ids: number[][] = [];
    for (let chain = 0; chain < spec.chains; chain++) {
      const links: number[] = [];
      for (let link = 0; link < spec.links; link++) {
        const id = transforms.length + 1;
        const x = (chain - (spec.chains - 1) / 2) * SPACING;
        transforms.push({ id, parent: link ? id - 1 : BAR, position: link ? [0, -LINK, 0] : [x, 0, 0] });
        links.push(id);
      }
      ids.push(links);
    }
    const created = createClothScene({
      coordinates: THREE_COORDINATES,
      transforms,
      colliders: [{ id: 'ball', transform: BALL, shape: 'sphere', radius: 0.16 }],
      cloths: [
        { name: 'wall', roots: ids.map((links) => links[0] ?? 0), anchor: BAR, colliders: ['ball'], settings: { gravity: 6, damping: 0.05, radius: 0.012 } },
      ],
    });
    const system = ClothSystem.create({ scene: created });
    const [simulation] = system.simulations;
    if (!simulation) throw new Error('The wall has no cloth.');
    const vertexOf = new Map(simulation.mesh.transformIds.map((id, vertex) => [id, vertex]));
    const order = ids.flat().map((id) => vertexOf.get(id) ?? 0);
    return new WallSimulation({ spec, system, transforms: new Map(transforms.map((transform) => [transform.id, transform])), order });
  }

  get particleCount(): number {
    return this.order.length;
  }

  step({ deltaTime, time }: WallStep): WallFrame {
    const start = performance.now();
    this.bar = restPose([Math.sin(time * 0.9) * 0.25, 1.9 + Math.sin(time * 1.7) * 0.04, 0], axisAngle([0, 0, 1], Math.sin(time * 1.3) * 0.08));
    this.ball = restPose([Math.sin(time * 0.75) * 1.4, 1.15 + Math.sin(time * 1.9) * 0.15, 0.08 + Math.cos(time * 0.75) * 0.12]);
    this.poses.clear();
    this.system.update({ frameDeltaTime: deltaTime, pose: (id) => this.poseOf(id) });
    const physicsMilliseconds = performance.now() - start;
    const particles = this.system.simulations[0]?.output.positions ?? [];
    const positions = new Float32Array(this.order.length * 3 + 3);
    this.order.forEach((vertex, index) => positions.set(particles[vertex] ?? [0, 0, 0], index * 3));
    positions.set(this.ball.position, this.order.length * 3);
    return { positions, physicsMilliseconds };
  }

  private poseOf(id: number): Pose {
    if (id === BAR) return this.bar;
    if (id === BALL) return this.ball;
    const known = this.poses.get(id);
    if (known) return known;
    const transform = this.transforms.get(id);
    if (!transform) return this.bar;
    const parent = this.poseOf(transform.parent ?? BAR);
    const position = transform.position ?? [0, 0, 0],
      rotation = transform.rotation ?? [0, 0, 0, 1],
      scale = transform.scale ?? [1, 1, 1];
    const matrix = multiplyMatrices(parent.matrix, composeMatrix(position, rotation, scale));
    const pose: Pose = {
      position: [matrix[12], matrix[13], matrix[14]],
      rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, rotation)),
      scale: multiplyVectors(parent.scale, scale),
      matrix,
    };
    this.poses.set(id, pose);
    return pose;
  }
}

function restPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number] = [0, 0, 0, 1]): Pose {
  return { position: [...position], rotation: [...rotation], scale: [1, 1, 1], matrix: composeMatrix(position, rotation, [1, 1, 1]) };
}
