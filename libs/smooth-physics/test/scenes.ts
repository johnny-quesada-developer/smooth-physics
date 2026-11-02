// Synthetic, engine-free cloth scenes for tests and benchmarks: an abstract mannequin with a skirt, hair strands and
// ribbons, the robe mannequin of the showcase example, hanging chains and a curtain. Coordinates are the solver space
// (left-handed, metres, Y up).
import { createClothScene, type ClothSpec, type ColliderSpec, type SceneSpec, type TransformSpec, type Triple } from '../src/authoring.ts';
import { fround } from '../src/float32/scalar.ts';
import { composeMatrix, multiplyMatrices, type Matrix4 } from '../src/float32/matrix.ts';
import { axisAngle, multiplyQuaternions, normalizeQuaternion, type Quaternion } from '../src/float32/quaternion.ts';
import { multiplyVectors, normalize, type Vector3 } from '../src/float32/vector.ts';
import type { ClothScene } from '../src/scene-format/types.ts';
import type { Pose } from '../src/cloth-state.ts';

export type SceneKind = 'mannequin' | 'robe' | 'chains' | 'curtain';
export type SceneSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SyntheticScene = { readonly scene: ClothScene; readonly spec: SceneSpec; readonly swing: ReadonlyMap<number, Vector3> };
export type ClothOverride = Pick<ClothSpec, 'settings' | 'normals'>;

class SceneBuilder {
  readonly transforms: TransformSpec[] = [];
  private readonly byName = new Map<string, number>();

  add({ name, parent, position }: { name: string; parent: string | null; position: Triple }): number {
    const id = this.transforms.length + 1;
    this.transforms.push({ id, name, ...(parent === null ? {} : { parent: this.id(parent) }), position, rotation: [0, 0, 0, 1] });
    this.byName.set(name, id);
    return id;
  }

  // A chain below parent: the first link offset from the parent, then each link offset from the previous one.
  chain({ prefix, parent, first, step, links }: { prefix: string; parent: string; first: Triple; step: (link: number) => Triple; links: number }): number {
    let previous = parent;
    for (let link = 0; link < links; link++) {
      this.add({ name: `${prefix}_${link}`, parent: previous, position: link === 0 ? first : step(link) });
      previous = `${prefix}_${link}`;
    }
    return this.id(`${prefix}_0`);
  }

  id(name: string): number {
    const id = this.byName.get(name);
    if (id === undefined) throw new Error(`Unknown transform ${name}.`);
    return id;
  }
}

const SIZES: Readonly<Record<SceneSize, readonly [columns: number, rows: number, strands: number, links: number, ribbon: number]>> = {
  small: [8, 4, 6, 6, 4],
  medium: [16, 6, 10, 10, 6],
  large: [24, 8, 16, 14, 8],
  xlarge: [32, 10, 24, 18, 10],
};

const SIDES: readonly (readonly ['L' | 'R', number])[] = [
  ['L', -0.1],
  ['R', 0.1],
];

function mannequin(builder: SceneBuilder): ColliderSpec[] {
  builder.add({ name: 'root', parent: null, position: [0, 0, 0] });
  builder.add({ name: 'hips', parent: 'root', position: [0, 0.95, 0] });
  builder.add({ name: 'spine', parent: 'hips', position: [0, 0.15, 0] });
  builder.add({ name: 'chest', parent: 'spine', position: [0, 0.2, 0] });
  builder.add({ name: 'neck', parent: 'chest', position: [0, 0.17, 0] });
  builder.add({ name: 'head', parent: 'neck', position: [0, 0.1, 0] });
  for (const [side, sideX] of SIDES) {
    builder.add({ name: `thigh${side}`, parent: 'hips', position: [sideX, -0.02, 0] });
    builder.add({ name: `knee${side}`, parent: `thigh${side}`, position: [0, -0.44, 0] });
  }

  return [
    { id: 'head', transform: builder.id('head'), shape: 'sphere', radius: 0.11, center: [0, 0.09, 0] },
    { id: 'torso', transform: builder.id('spine'), shape: 'capsule', radius: 0.13, length: 0.34, axis: 'y', center: [0, 0.12, 0] },
    { id: 'hips', transform: builder.id('hips'), shape: 'sphere', radius: 0.15, center: [0, -0.02, 0] },
    ...SIDES.map(([side]) => side).flatMap((side): ColliderSpec[] => [
      {
        id: `thigh${side}`,
        transform: builder.id(`thigh${side}`),
        shape: 'capsule',
        radius: 0.075,
        endRadius: 0.06,
        length: 0.44,
        axis: 'y',
        center: [0, -0.22, 0],
      },
      { id: `shin${side}`, transform: builder.id(`knee${side}`), shape: 'capsule', radius: 0.055, length: 0.42, axis: 'y', center: [0, -0.21, 0] },
    ]),
  ];
}

function skirt({ builder, columns, rows }: { builder: SceneBuilder; columns: number; rows: number }): ClothSpec {
  const roots = Array.from({ length: columns }, (_, column) => {
    const angle = (column / columns) * Math.PI * 2;
    const outwardX = Math.sin(angle);
    const outwardZ = Math.cos(angle);
    return builder.chain({
      prefix: `skirt${column}`,
      parent: 'hips',
      first: [outwardX * 0.17, -0.03, outwardZ * 0.17],
      step: () => [outwardX * 0.03, -0.075, outwardZ * 0.03],
      links: rows + 1,
    });
  });
  return {
    name: 'skirt',
    roots,
    anchor: builder.id('hips'),
    connection: 'ring',
    colliders: ['hips', 'thighL', 'thighR', 'shinL', 'shinR'],
    settings: {
      gravity: 6,
      damping: 0.08,
      radius: [0.02, 0.025],
      stiffness: [1, 0.7],
      restoration: { stiffness: [0.25, 0.05] },
      inertia: { world: 0.6, local: 0.8 },
      collision: { mode: 'edge', friction: 0.1 },
    },
  };
}

function hair({ builder, strands, links }: { builder: SceneBuilder; strands: number; links: number }): ClothSpec {
  // The strands fan out around the head over -1.1 to 1.1 radians, centred on -Z.
  const roots = Array.from({ length: strands }, (_, strand) => {
    const angle = -1.1 + (2.2 * strand) / Math.max(1, strands - 1);
    return builder.chain({
      prefix: `hair${strand}`,
      parent: 'head',
      first: [Math.sin(angle) * 0.1, 0.12, -Math.cos(angle) * 0.1],
      step: (link) => [0, -0.06, (-0.008 * (links - link)) / links],
      links: links + 1,
    });
  });
  return {
    name: 'hair',
    roots,
    anchor: builder.id('head'),
    connection: 'strip',
    colliders: ['head', 'torso'],
    settings: {
      gravity: 5,
      damping: 0.05,
      radius: 0.015,
      stiffness: [1, 0.5],
      restoration: { stiffness: [0.3, 0.05] },
      angleLimit: { enabled: true, degrees: [0, 50] },
    },
  };
}

function ribbons({ builder, links, colliders }: { builder: SceneBuilder; links: number; colliders: readonly string[] }): ClothSpec {
  return {
    name: 'ribbons',
    connection: 'chains',
    anchor: builder.id('neck'),
    colliders,
    roots: [-0.05, 0.05].map((offsetX, index) =>
      builder.chain({ prefix: `ribbon${index}`, parent: 'neck', first: [offsetX, 0, -0.1], step: () => [0, -0.07, -0.01], links: links + 1 }),
    ),
    settings: { gravity: 4, damping: 0.03, radius: 0.012, inertia: { world: 0.8 } },
  };
}

// The showcase's "Robe on a mannequin": hips and legs with a ring of chains around the hips. The medium size is the
// example's robe; the other sizes keep its length and flare with fewer or more chains and links.
const ROBE_SIZES: Readonly<Record<SceneSize, readonly [columns: number, links: number]>> = {
  small: [12, 5],
  medium: [20, 7],
  large: [28, 12],
  xlarge: [40, 18],
};

function robeMannequin({ builder, size }: { builder: SceneBuilder; size: SceneSize }): { cloths: ClothSpec[]; colliders: ColliderSpec[] } {
  builder.add({ name: 'root', parent: null, position: [0, 0, 0] });
  builder.add({ name: 'hips', parent: 'root', position: [0, 0.95, 0] });
  for (const [side, sideX] of [
    ['L', -0.09],
    ['R', 0.09],
  ] as const) {
    builder.add({ name: `thigh${side}`, parent: 'hips', position: [sideX, -0.04, 0] });
    builder.add({ name: `knee${side}`, parent: `thigh${side}`, position: [0, -0.42, 0] });
  }

  const colliders: ColliderSpec[] = [
    { id: 'hips', transform: builder.id('hips'), shape: 'capsule', radius: 0.14, length: 0.3, axis: 'x' },
    ...(['L', 'R'] as const).flatMap((side): ColliderSpec[] => [
      {
        id: `thigh${side}`,
        transform: builder.id(`thigh${side}`),
        shape: 'capsule',
        radius: 0.075,
        endRadius: 0.06,
        length: 0.42,
        axis: 'y',
        center: [0, -0.21, 0],
      },
      {
        id: `shin${side}`,
        transform: builder.id(`knee${side}`),
        shape: 'capsule',
        radius: 0.06,
        endRadius: 0.045,
        length: 0.42,
        axis: 'y',
        center: [0, -0.21, 0],
      },
    ]),
  ];

  const [columns, links] = ROBE_SIZES[size];
  // The example steps 0.075 m down over 7 links; the scale keeps that length and flare for other link counts.
  const scale = 6 / (links - 1);
  const roots = Array.from({ length: columns }, (_, column) => {
    const angle = (column / columns) * Math.PI * 2;
    const outwardX = Math.sin(angle);
    const outwardZ = Math.cos(angle);
    return builder.chain({
      prefix: `robe${column}`,
      parent: 'hips',
      first: [outwardX * 0.17, -0.02, outwardZ * 0.17],
      step: (link) => {
        const flare = (0.018 + link * scale * 0.004) * scale;
        return [outwardX * flare, -0.075 * scale, outwardZ * flare];
      },
      links,
    });
  });
  const robe: ClothSpec = {
    name: 'robe',
    roots,
    anchor: builder.id('hips'),
    connection: 'ring',
    colliders: colliders.map((collider) => String(collider.id)),
    settings: {
      gravity: 5,
      damping: 0.04,
      radius: 0.02,
      stiffness: [1, 0.6],
      restoration: { stiffness: [0.25, 0.05] },
      collision: { mode: 'edge', friction: 0.1 },
    },
  };
  return { cloths: [robe], colliders };
}

// override is merged into every cloth: its settings over the scene's own.
export function buildScene({ kind, size, override = {} }: { kind: SceneKind; size: SceneSize; override?: ClothOverride }): SyntheticScene {
  const [columns, rows, strands, links, ribbonLinks] = SIZES[size];
  const builder = new SceneBuilder();
  let cloths: ClothSpec[];
  let colliders: ColliderSpec[];
  // The swing axis of each animated transform, by name.
  let swing: Readonly<Record<string, Triple>>;

  if (kind === 'mannequin') {
    colliders = mannequin(builder);
    cloths = [
      skirt({ builder, columns, rows }),
      hair({ builder, strands, links }),
      ribbons({ builder, links: ribbonLinks, colliders: colliders.map((collider) => String(collider.id)) }),
    ];
    swing = { hips: [0, 1, 0], spine: [1, 0, 0.3], head: [0, 1, 0.2], thighL: [1, 0, 0], thighR: [-1, 0, 0], kneeL: [1, 0, 0], kneeR: [1, 0, 0] };
  } else if (kind === 'robe') {
    ({ cloths, colliders } = robeMannequin({ builder, size }));
    swing = { hips: [0, 1, 0], thighL: [1, 0, 0], thighR: [-1, 0, 0], kneeL: [1, 0, 0], kneeR: [1, 0, 0] };
  } else if (kind === 'chains') {
    builder.add({ name: 'root', parent: null, position: [0, 0, 0] });
    builder.add({ name: 'bar', parent: 'root', position: [0, 1.6, 0] });
    builder.add({ name: 'ball', parent: 'root', position: [0, 1.1, 0.12] });
    colliders = [{ id: 'ball', transform: builder.id('ball'), shape: 'sphere', radius: 0.12 }];
    const roots = Array.from({ length: columns }, (_, index) =>
      builder.chain({
        prefix: `chain${index}`,
        parent: 'bar',
        first: [-0.6 + (1.2 * index) / Math.max(1, columns - 1), 0, 0],
        step: () => [0, -0.06, 0],
        links,
      }),
    );
    cloths = [{ name: 'chains', roots, anchor: builder.id('bar'), connection: 'chains', colliders: ['ball'], settings: { damping: 0.04, radius: 0.015 } }];
    swing = { bar: [0, 0, 1], ball: [0, 1, 0] };
  } else {
    builder.add({ name: 'root', parent: null, position: [0, 0, 0] });
    builder.add({ name: 'rod', parent: 'root', position: [0, 1.8, 0] });
    builder.add({ name: 'pusher', parent: 'root', position: [0, 1.2, 0.25] });
    colliders = [{ id: 'pusher', transform: builder.id('pusher'), shape: 'capsule', radius: 0.1, length: 0.5, axis: 'x' }];
    const roots = Array.from({ length: columns }, (_, index) =>
      builder.chain({
        prefix: `fold${index}`,
        parent: 'rod',
        first: [-0.7 + (1.4 * index) / Math.max(1, columns - 1), 0, (index % 2) * 0.02],
        step: () => [0, -0.08, 0],
        links,
      }),
    );
    cloths = [
      {
        name: 'curtain',
        roots,
        anchor: builder.id('rod'),
        connection: 'nearest',
        colliders: ['pusher'],
        settings: { damping: 0.06, radius: 0.02, bendingStiffness: 0.8, collision: { mode: 'edge', friction: 0.2 } },
      },
    ];
    swing = { rod: [0, 0, 1], pusher: [0, 1, 0] };
  }

  cloths = cloths.map((cloth) => ({ ...cloth, ...override, settings: { ...cloth.settings, ...override.settings } }));
  const spec: SceneSpec = { transforms: builder.transforms, cloths, colliders };
  const clothScene = createClothScene(spec);
  const swingById = new Map<number, Vector3>(
    Object.entries(swing).map(([name, axis]) => [builder.id(name), normalize([fround(axis[0]), fround(axis[1]), fround(axis[2])])]),
  );
  return { scene: clothScene, spec, swing: swingById };
}

export type SceneDriver = { readonly pose: (id: number) => Pose; advance(time: number): void };

// Deterministic motion: the root walks a circle, turns and hops; listed bones swing about their axes.
export function createDriver({ scene, swing }: Pick<SyntheticScene, 'scene' | 'swing'>): SceneDriver {
  // World poses of this frame, by transform id.
  const cache = new Map<number, Pose>();
  let rootPosition: Vector3 = [0, 0, 0];
  let rootRotation: Quaternion = [0, 0, 0, 1];
  let swingAngle = 0;
  const identity: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], matrix: [] };

  const pose = (id: number): Pose => {
    const cached = cache.get(id);
    if (cached) return cached;
    const transform = scene.transforms.get(id);
    if (!transform) return identity;

    const localPosition: Vector3 = [fround(transform.localPosition.x), fround(transform.localPosition.y), fround(transform.localPosition.z)];
    const baseRotation: Quaternion = [
      fround(transform.localRotation.x),
      fround(transform.localRotation.y),
      fround(transform.localRotation.z),
      fround(transform.localRotation.w),
    ];
    const axis = swing.get(id);
    const localRotation = axis ? normalizeQuaternion(multiplyQuaternions(baseRotation, axisAngle(axis, fround(swingAngle)))) : baseRotation;
    const localScale: Vector3 = [fround(transform.localScale.x), fround(transform.localScale.y), fround(transform.localScale.z)];

    // A top-level transform hangs from the moving root.
    const parent: { matrix: Matrix4; rotation: Quaternion; scale: Vector3 } = transform.parent
      ? pose(transform.parent)
      : { matrix: composeMatrix(rootPosition, rootRotation, [1, 1, 1]), rotation: rootRotation, scale: [1, 1, 1] };
    const matrix = multiplyMatrices(parent.matrix, composeMatrix(localPosition, localRotation, localScale));
    const world: Pose = {
      position: [matrix[12], matrix[13], matrix[14]],
      rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, localRotation)),
      scale: multiplyVectors(parent.scale, localScale),
      matrix,
    };
    cache.set(id, world);
    return world;
  };

  return {
    pose,
    advance(time: number): void {
      cache.clear();
      rootPosition = [fround(0.35 * Math.sin(time * 2.1)), fround(Math.max(0, Math.sin(time * 5)) * 0.12), fround(0.25 * Math.sin(time * 3.3))];
      rootRotation = axisAngle([0, 1, 0], fround(time * 2.5 + Math.sin(time * 1.7)));
      swingAngle = 0.55 * Math.sin(time * 4);
    },
  };
}
