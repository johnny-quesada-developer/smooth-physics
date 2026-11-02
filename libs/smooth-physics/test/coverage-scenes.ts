// Small scenes that reach solver paths the other scenes leave alone: folded triangles (the volume constraint),
// teleports, centrifugal force and speed limits, the 'set' and uniform forces, angle limit with restoration, and the
// non-finite watchdog. Their traces are recorded so that refactors of the solver's memory use must keep them exact.
import { createClothScene, type ClothSettingsInput, type ClothSpec, type SceneSpec, type TransformSpec } from '../src/authoring.ts';
import type { ClothScene } from '../src/scene-format/types.ts';
import type { ForceInput, Pose } from '../src/cloth-state.ts';
import { fround } from '../src/float32/scalar.ts';
import { composeMatrix, multiplyMatrices } from '../src/float32/matrix.ts';
import { axisAngle, multiplyQuaternions, normalizeQuaternion, type Quaternion } from '../src/float32/quaternion.ts';
import { multiplyVectors, type Vector3 } from '../src/float32/vector.ts';

export type CoverageScene = {
  readonly name: string;
  readonly scene: ClothScene;
  readonly pose: (id: number) => Pose;
  // Moves the root for this frame; the scene decides jumps and broken poses.
  advance(frame: number): void;
  // A force to add before this frame's update, if any.
  force(frame: number): ForceInput | null;
};

type Recipe = {
  readonly name: string;
  readonly build: () => {
    spec: SceneSpec;
    jumps?: (frame: number) => Vector3;
    spin?: (frame: number) => number;
    broken?: (frame: number) => boolean;
    forces?: (frame: number) => ForceInput | null;
  };
};

// A narrow tube of chains: neighbouring triangles fold past 90 degrees, so bending adds volume pairs.
function tube({
  columns,
  settings,
  connection = 'ring',
  coincidentLink,
}: {
  columns: number;
  settings: ClothSettingsInput;
  connection?: ClothSpec['connection'];
  // A link placed exactly on its parent: a zero-length segment.
  coincidentLink?: number;
}): SceneSpec {
  const transforms: TransformSpec[] = [
    { id: 1, name: 'root' },
    { id: 2, name: 'hub', parent: 1, position: [0, 1.5, 0] },
  ];
  const roots: number[] = [];
  // Each column hangs seven links: the first on a ring around the hub, each next one 8 cm lower and slightly farther out.
  for (let column = 0; column < columns; column++) {
    const angle = (column / columns) * Math.PI * 2;
    for (let link = 0; link < 7; link++) {
      const id = transforms.length + 1;
      transforms.push({
        id,
        parent: link ? id - 1 : 2,
        position:
          link === coincidentLink
            ? [0, 0, 0]
            : link
              ? [Math.sin(angle) * 0.01, -0.08, Math.cos(angle) * 0.01]
              : [Math.sin(angle) * 0.06, 0, Math.cos(angle) * 0.06],
      });
      if (!link) roots.push(id);
    }
  }

  transforms.push({ id: transforms.length + 1, name: 'ball', parent: 1, position: [0.05, 1.1, 0.1] });
  return {
    transforms,
    colliders: [{ id: 'ball', transform: transforms.length, shape: 'sphere', radius: 0.08 }],
    cloths: [{ name: 'tube', roots, anchor: 2, connection, colliders: ['ball'], settings }],
  };
}

const RECIPES: readonly Recipe[] = [
  {
    name: 'tube-volume',
    build: () => ({ spec: tube({ columns: 3, settings: { bendingStiffness: 1, collision: { mode: 'edge', friction: 0.3 } } }) }),
  },
  {
    name: 'tube-limits-centrifugal',
    build: () => ({
      spec: tube({
        columns: 5,
        settings: {
          angleLimit: { degrees: [10, 40], stiffness: 0.7 },
          restoration: { stiffness: [0.4, 0.1], velocityDamping: 0.5, gravityFalloff: 0.3 },
          inertia: { centrifugal: 0.8, particleSpeedLimit: 1.2, localMovementSpeedLimit: 0.8, localRotationSpeedLimit: 180, rootFollow: 0.5 },
          gravityFalloff: 0.4,
          maxDistance: { distance: [0, 0.3] },
          behindLimit: { radius: 0.2, distance: [0, 0.02], axis: 'z' },
        },
      }),
      forces: (frame) =>
        frame === 150
          ? { force: [4, 0, -3], mode: 'set' }
          : frame === 300
            ? { force: [0, 6, 2], uniform: true }
            : frame === 450
              ? { force: [-3, 1, 0], mode: 'set', uniform: true }
              : null,
    }),
  },
  {
    name: 'tube-teleport-reset',
    build: () => ({
      spec: tube({ columns: 4, connection: 'strip', settings: { inertia: { teleport: { mode: 'reset', distance: 0.4, rotation: 60 } } } }),
      jumps: (frame) => (frame >= 200 ? [1.5, 0, 0] : frame >= 120 ? [0, 0, 0.9] : [0, 0, 0]),
    }),
  },
  {
    name: 'tube-teleport-keep',
    build: () => ({
      spec: tube({ columns: 4, connection: 'nearest', settings: { inertia: { teleport: { mode: 'keep', distance: 0.4, rotation: 60 } } } }),
      jumps: (frame) => (frame >= 200 ? [1.5, 0, 0] : frame >= 120 ? [0, 0, 0.9] : [0, 0, 0]),
    }),
  },
  {
    // A zero-length link, angle limit and restoration together, and an anchor that moves and turns faster than the
    // inertia speed limits.
    name: 'chains-coincident-fast',
    build: () => ({
      spec: tube({ columns: 3, connection: 'chains', coincidentLink: 3, settings: { angleLimit: { degrees: [0, 30] }, restoration: { stiffness: 0.5 } } }),
      jumps: (frame) => [fround(Math.sin(frame * 0.5) * 0.3), 0, 0],
      spin: (frame) => frame * 0.3,
    }),
  },
  {
    // A non-finite pose for one frame: the watchdog resets the cloth instead of letting NaN spread.
    name: 'tube-watchdog',
    build: () => ({ spec: tube({ columns: 3, settings: {} }), broken: (frame) => frame === 180 }),
  },
];

export function buildCoverageScene(name: string): CoverageScene {
  const recipe = RECIPES.find((candidate) => candidate.name === name);
  if (!recipe) throw new Error(`Unknown coverage scene ${name}.`);
  const { spec, jumps, spin, broken, forces } = recipe.build();
  const scene = createClothScene(spec);
  const transforms = new Map(spec.transforms.map((transform) => [transform.id, transform]));
  // World poses of this frame, by transform id.
  const cache = new Map<number, Pose>();
  let root: Pose = poseOf([0, 0, 0], [0, 0, 0, 1]);
  let nonFinite = false;

  // Transform 2 is the hub every scene hangs its cloth from: it swings, and carries the broken pose.
  const pose = (id: number): Pose => {
    const cached = cache.get(id);
    if (cached) return cached;
    const transform = transforms.get(id);
    if (!transform?.parent) return root;

    const parent = pose(transform.parent);
    const [positionX, positionY, positionZ] = transform.position ?? [0, 0, 0];
    const position: Vector3 = [fround(positionX), fround(positionY), fround(positionZ)];
    const swing = id === 2 ? axisAngle([1, 0, 0.3], fround(0.4 * Math.sin(frameTime * 3))) : ([0, 0, 0, 1] satisfies Quaternion);
    const matrix = multiplyMatrices(parent.matrix, composeMatrix(position, swing, [1, 1, 1]));
    const world: Pose = {
      position: nonFinite && id === 2 ? [Number.NaN, 0, 0] : [matrix[12], matrix[13], matrix[14]],
      rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, swing)),
      scale: multiplyVectors(parent.scale, [1, 1, 1]),
      matrix: nonFinite && id === 2 ? matrix.map(() => Number.NaN) : matrix,
    };
    cache.set(id, world);
    return world;
  };
  let frameTime = 0;

  return {
    name,
    scene,
    pose,
    advance(frame: number): void {
      cache.clear();
      frameTime = frame / 60;
      nonFinite = broken?.(frame) ?? false;
      const [jumpX, jumpY, jumpZ] = jumps?.(frame) ?? [0, 0, 0];
      root = poseOf(
        [
          fround(jumpX + 0.3 * Math.sin(frameTime * 2.2)),
          fround(jumpY + Math.max(0, Math.sin(frameTime * 4)) * 0.1),
          fround(jumpZ + 0.2 * Math.sin(frameTime * 3.1)),
        ],
        axisAngle([0, 1, 0], fround(frameTime * 2.4 + Math.sin(frameTime * 1.3) + (spin?.(frame) ?? 0))),
      );
    },
    force: (frame) => forces?.(frame) ?? null,
  };
}

function poseOf(position: Vector3, rotation: Quaternion): Pose {
  return { position, rotation, scale: [1, 1, 1], matrix: composeMatrix(position, rotation, [1, 1, 1]) };
}
