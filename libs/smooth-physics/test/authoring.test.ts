// Authoring: transform order, defaults, curves, rest poses, fixed and excluded bones, and refusals thrown as
// SmoothPhysicsError.
import { describe, expect, test } from 'vite-plus/test';
import {
  createClothScene,
  DEFAULT_SETTINGS,
  ENABLED_DEFAULTS,
  resolveSettings,
  type CurvePoint,
  type RestPoseSpec,
  type TransformSpec,
} from '../src/authoring.ts';
import { buildClothMesh } from '../src/cloth-mesh/build.ts';
import { SmoothPhysicsError } from '../src/errors.ts';
import { isExcluded, isPinned } from '../src/cloth-mesh/attributes.ts';
import { clothParameters } from '../src/parameters.ts';
import type { ClothScene } from '../src/scene-format/types.ts';

// A small tree: two roots, one with a fork. The setup visits roots last first, depth first.
const transforms: TransformSpec[] = [
  { id: 1, name: 'root' },
  { id: 2, name: 'a', parent: 1, position: [0, 1, 0] },
  { id: 3, name: 'a1', parent: 2, position: [0, -0.1, 0] },
  { id: 4, name: 'b', parent: 1, position: [0.2, 1, 0] },
  { id: 5, name: 'b1', parent: 4, position: [0, -0.1, 0] },
  { id: 6, name: 'b2', parent: 4, position: [0.05, -0.1, 0] },
];

// A flat curve key at the given time, and a rest pose entry at the origin.
const key = (time: number): CurvePoint => ({ time, value: 1, inSlope: 0, outSlope: 0 });
const rest = (id: number, rotation: RestPoseSpec['rotation'] = [0, 0, 0, 1]): RestPoseSpec => ({ id, position: [0, 0, 0], rotation });

// The SmoothPhysicsError a call throws.
function refusal(call: () => unknown): SmoothPhysicsError {
  try {
    call();
  } catch (error) {
    if (error instanceof SmoothPhysicsError) return error;
    throw error;
  }
  throw new Error('Expected a SmoothPhysicsError.');
}

// Each particle's attribute of the first cloth: X excluded, F fixed (pinned), M simulated.
function attributesOf(scene: ClothScene): string[] {
  const cloth = scene.cloths[0];
  if (!cloth) throw new Error('No cloth.');
  return [...buildClothMesh({ scene, cloth }).attributes].map((attribute) => (isExcluded(attribute) ? 'X' : isPinned(attribute) ? 'F' : 'M'));
}

describe('createClothScene', () => {
  test('visits roots last first, depth first, and fixes roots by default', () => {
    const scene = createClothScene({ transforms, cloths: [{ name: 'tree', roots: [2, 4], anchor: 1, settings: { damping: [0.1, 0.2] } }] });
    const cloth = scene.cloths[0];
    if (!cloth) throw new Error('No cloth.');
    expect(buildClothMesh({ scene, cloth }).transformIds).toEqual([4, 6, 5, 2, 3]);
    expect(attributesOf(scene)).toEqual(['F', 'M', 'M', 'F', 'M']);
    expect(scene.transforms.get(1)?.children).toEqual([2, 4]);
  });

  test('scales a [start, end] damping like an authored curve and keeps constants constant', () => {
    const scene = createClothScene({ transforms, cloths: [{ roots: [2, 4], anchor: 1, settings: { damping: [0.1, 0.2] } }] });
    const cloth = scene.cloths[0];
    if (!cloth) throw new Error('No cloth.');
    const parameters = clothParameters(cloth.configuration);
    expect(parameters.dampingCurve[0]).toBeCloseTo(0.02, 7);
    expect(parameters.dampingCurve[15]).toBeCloseTo(0.04, 7);
    expect(new Set(parameters.radiusCurve)).toEqual(new Set([Math.fround(0.02)]));
  });

  test('samples curves with several keys, a scale and step keys', () => {
    const radius = {
      scale: 0.02,
      keys: [
        { time: 0, value: 1, inSlope: 0, outSlope: 'step' },
        { time: 0.5, value: 0.5, inSlope: 0, outSlope: 0 },
        { time: 1, value: 0.8, inSlope: 0, outSlope: 0 },
      ],
    } as const;
    const scene = createClothScene({ transforms, cloths: [{ roots: [2, 4], anchor: 1, settings: { radius } }] });
    const cloth = scene.cloths[0];
    if (!cloth) throw new Error('No cloth.');
    const samples = clothParameters(cloth.configuration).radiusCurve;
    expect(new Set(samples.slice(0, 8))).toEqual(new Set([Math.fround(0.02)]));
    expect(samples[15]).toBeCloseTo(0.016, 7);
    expect(Math.min(...samples)).toBeCloseTo(0.01, 3);
  });

  test('builds the cloth from its rest pose instead of the transforms', () => {
    const restPose = [
      { id: 2, position: [0, 2, 0], rotation: [0, 0, 0, 1] },
      { id: 3, position: [0.1, 1.9, 0], rotation: [0, 0, 0, 1] },
      { id: 1, position: [0, 1, 0], rotation: [0, 0, 0, 1] },
    ] as const;
    const scene = createClothScene({ transforms, cloths: [{ roots: [2], anchor: 1, restPose }] });
    const cloth = scene.cloths[0];
    if (!cloth) throw new Error('No cloth.');
    expect(buildClothMesh({ scene, cloth }).localPositions).toEqual([
      [0, 1, 0],
      [Math.fround(0.1), Math.fround(0.9), 0],
    ]);
  });

  test('honours explicit fixed and excluded bones', () => {
    const scene = createClothScene({ transforms, cloths: [{ roots: [2, 4], anchor: 1, fixed: [2, 4, 6], exclude: [3] }] });
    expect(attributesOf(scene)).toEqual(['F', 'F', 'M', 'F', 'X']);
  });

  test.each([
    [{ cloths: [{ roots: [99], anchor: 1 }] }, /roots must name existing transforms/],
    [{ cloths: [{ roots: [2, 3], anchor: 1 }] }, /reached twice/],
    [{ cloths: [{ roots: [2], anchor: 1, fixed: [5] }] }, /not part of this cloth/],
    [{ cloths: [{ roots: [2], anchor: 1, colliders: ['nope'] }] }, /unknown collider/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { gravity: Number.NaN } }] }, /settings\.gravity: Invalid input: expected number, received NaN/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { radius: { keys: [] } } }] }, /settings\.radius\.keys: Too small/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { radius: { keys: [key(0.5), key(0.5)] } } }] }, /key times must increase/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { animationBlend: 1.5 } }] }, /settings\.animationBlend: Too big/],
    [{ cloths: [{ roots: [2], anchor: 1, restPose: [rest(2), rest(1)] }] }, /restPose is missing transform 3/],
    [{ cloths: [{ roots: [2], anchor: 1, restPose: [rest(2), rest(3), rest(1), rest(4)] }] }, /restPose transform 4 is not part of this cloth/],
    [{ cloths: [{ roots: [2], anchor: 1, restPose: [rest(2), rest(3), rest(1, [0, 0, 0, 2])] }] }, /unit quaternion/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { damping: 1.5 } }] }, /settings\.damping: Too big: expected number to be <=1/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { radius: [0.02, -0.01] as const } }] }, /settings\.radius\[1\]: Too small/],
    [
      { cloths: [{ roots: [2], anchor: 1, settings: { stiffness: { scale: 2, keys: [key(0)] } } }] },
      /settings\.stiffness: curve values must be between 0 and 1/,
    ],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { gravityDirection: [0, 0, 0] as const } }] }, /settings\.gravityDirection: must not be a zero vector/],
    [{ cloths: [{ roots: [2], anchor: 1, settings: { angleLimit: { degrees: 200 } } }] }, /settings\.angleLimit\.degrees/],
  ])('refuses invalid specs by throwing (%#)', (spec, message) => {
    const error = refusal(() => createClothScene({ transforms, ...spec }));
    expect(error.code).toBe('INVALID_CLOTH_SPEC');
    expect(error.message).toMatch(message);
  });

  test('refuses normals and behind-limit axes that JavaScript callers can pass', () => {
    // Variables, not literals, so the type checker allows the values the way untyped callers would.
    const normals: string = 'inward';
    const axis: string = 'w';
    const badNormals = refusal(() => createClothScene(JSON.parse(JSON.stringify({ transforms, cloths: [{ roots: [2], anchor: 1, normals }] }))));
    const badAxis = refusal(() =>
      createClothScene(
        JSON.parse(JSON.stringify({ transforms, cloths: [{ roots: [2], anchor: 1, settings: { behindLimit: { radius: 1, distance: 0, axis } } }] })),
      ),
    );
    expect(badNormals.message).toMatch(/cloths\[0\]\.normals: Invalid option/);
    expect(badAxis.message).toMatch(/behindLimit\.axis: Invalid option/);
  });

  test('takes the fields of a group only on the variant they belong to', () => {
    // Variables, not literals, so the type checker allows the mixed groups the way untyped callers would.
    const offWithDegrees = { angleLimit: { enabled: false, degrees: [0, 30] } };
    const sphereWithLength = { shape: 'sphere', transform: 1, radius: 0.1, length: 0.3 };
    const halfCoordinates = { up: 'z' };
    const settings = refusal(() => resolveSettings({ settings: JSON.parse(JSON.stringify(offWithDegrees)) }));
    const sphere = refusal(() => createClothScene(JSON.parse(JSON.stringify({ transforms, cloths: [], colliders: [sphereWithLength] }))));
    const coordinates = refusal(() => createClothScene(JSON.parse(JSON.stringify({ transforms, cloths: [], coordinates: halfCoordinates }))));
    expect(settings.message).toMatch(/angleLimit: Unrecognized key: "degrees"/);
    expect(sphere.message).toMatch(/colliders\[0\]: Unrecognized key: "length"/);
    expect(coordinates.message).toMatch(/coordinates\.handedness: Invalid option/);
  });

  test('turns groups on with their defaults and off without values', () => {
    const resolved = resolveSettings({ settings: { angleLimit: { enabled: true }, restoration: { enabled: false }, collision: { friction: 0.3 } } });
    expect(resolved.angleLimit).toEqual({ enabled: true, ...ENABLED_DEFAULTS.angleLimit });
    expect(resolved.restoration).toEqual({ enabled: false });
    expect(resolved.collision).toEqual({ mode: 'point', friction: 0.3 });
  });

  test('refuses parent cycles and unknown parents', () => {
    const cycle = refusal(() =>
      createClothScene({
        transforms: [
          { id: 1, parent: 2 },
          { id: 2, parent: 1 },
        ],
        cloths: [],
      }),
    );
    const unknown = refusal(() => createClothScene({ transforms: [{ id: 1, parent: 7 }], cloths: [] }));
    expect(cycle.message).toMatch(/parent cycle/);
    expect(unknown.message).toMatch(/unknown parent 7/);
  });
});

describe('resolveSettings', () => {
  test('merges nested groups over the defaults one level deep', () => {
    const resolved = resolveSettings({ settings: { inertia: { world: 0.5 } } });
    expect(resolved.inertia).toEqual({ ...DEFAULT_SETTINGS.inertia, world: 0.5 });
  });

  test('refuses unknown names that JavaScript callers can pass', () => {
    // Variables, not literals, so the type checker allows the extra names the way untyped callers would.
    const topLevel = { damping: 0.1, dampning: 1 };
    const nestedGroup = { inertia: { world: 1, wrold: 1 } };
    const misspelled = refusal(() => resolveSettings({ settings: topLevel }));
    const nested = refusal(() => resolveSettings({ settings: nestedGroup }));
    expect(misspelled.message).toMatch(/Unrecognized key: "dampning"/);
    expect(nested.message).toMatch(/inertia: Unrecognized key: "wrold"/);
  });
});
