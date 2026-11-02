// Strict schemas for the inputs that are read once: scenes, settings and system options. Unknown keys are refused,
// numbers must be finite, and a group's fields only exist on the variant they belong to. Parsed values are not
// frozen (z.readonly freezes them): freezing them made every later simulation in JavaScriptCore up to 2.6 times slower.
import * as z from 'zod/mini';
import english from 'zod/v4/locales/en.js';
import type * as Three from 'three';
import type { ClothSettingsInput, Range, SceneSpec } from './authoring.ts';
import type { SystemOptions } from './cloth-system.ts';
import type { ThreeSceneSpec } from './three.ts';
import { SmoothPhysicsError, type ClothErrorCode } from './errors.ts';

// English messages are passed to each parse, so the caller's global zod configuration is left alone.
const { localeError } = english();

const optional = z.exactOptional;
const finite = z.number();
const nonNegative = z.number().check(z.gte(0));
const positive = z.number().check(z.gt(0));
const id = z.int().check(z.positive());
const triple = z.tuple([finite, finite, finite]);
const quaternion = z.tuple([finite, finite, finite, finite]);
// Rest pose rotations are used as given, so they must already be unit length; other rotations are normalized.
const unitRotation = quaternion.check(z.refine((value) => Math.abs(Math.hypot(...value) - 1) <= 1e-3, { error: 'must be a unit quaternion' }));
const rotation = quaternion.check(z.refine((value) => Math.hypot(...value) > 1e-6, { error: 'must not be a zero quaternion' }));
const axis = z.enum(['x', 'y', 'z']);
const signedAxis = z.enum(['x', 'y', 'z', '-x', '-y', '-z']);
const off = z.strictObject({ enabled: z.literal(false) });
const on = optional(z.literal(true));

const slope = z.union([finite, z.literal('step')], { error: 'expected a number or "step"' });
const curvePoint = z.strictObject({ time: finite, value: finite, inSlope: slope, outSlope: slope });
const curve = z.strictObject({ scale: optional(finite), keys: z.array(curvePoint).check(z.minLength(1)) });

// Ranges keep values where the solver's math holds: a value can be a valid number and still blow the cloth up.
const between = (minimum: number, maximum: number): z.ZodMiniNumber<number> =>
  Number.isFinite(maximum) ? z.number().check(z.gte(minimum), z.lte(maximum)) : z.number().check(z.gte(minimum));

// A Range whose number, [root, tip] pair or scaled curve keys all lie within the bounds. Only the keys are checked:
// the curve between them may overshoot.
function rangeBetween(minimum: number, maximum = Infinity): z.ZodMiniType<Range> {
  const boundedNumber = between(minimum, maximum);
  const bounds = Number.isFinite(maximum) ? `between ${minimum} and ${maximum}` : `at least ${minimum}`;
  const keysInside = ({ scale = 1, keys }: { readonly scale?: number; readonly keys: readonly { readonly value: number }[] }): boolean =>
    keys.every((key) => key.value * scale >= minimum && key.value * scale <= maximum);
  return z.union([boundedNumber, z.tuple([boundedNumber, boundedNumber]), curve.check(z.refine(keysInside, { error: `curve values must be ${bounds}` }))], {
    error: `expected a number ${bounds}, [root, tip] or { scale?, keys }`,
  });
}

const unit = between(0, 1);
const unitRange = rangeBetween(0, 1);
const distance = rangeBetween(0);
const direction = triple.check(z.refine((value) => Math.hypot(...value) > 1e-6, { error: 'must not be a zero vector' }));
const speedLimit = z.union([nonNegative, z.literal('off')], { error: 'expected a number of at least 0 or "off"' });

export const settingsInputSchema = z.strictObject({
  gravity: optional(nonNegative),
  gravityDirection: optional(direction),
  gravityFalloff: optional(unit),
  damping: optional(unitRange),
  radius: optional(distance),
  stiffness: optional(unitRange),
  compressionLimit: optional(unit),
  bendingStiffness: optional(unit),
  restoration: optional(
    z.discriminatedUnion('enabled', [
      off,
      z.strictObject({ enabled: on, stiffness: optional(unitRange), velocityDamping: optional(unit), gravityFalloff: optional(unit) }),
    ]),
  ),
  angleLimit: optional(
    z.discriminatedUnion('enabled', [off, z.strictObject({ enabled: on, degrees: optional(rangeBetween(0, 180)), stiffness: optional(unit) })]),
  ),
  inertia: optional(
    z.strictObject({
      world: optional(unit),
      local: optional(unit),
      anchor: optional(unit),
      smoothing: optional(unit),
      movementSpeedLimit: optional(speedLimit),
      rotationSpeedLimit: optional(speedLimit),
      localMovementSpeedLimit: optional(speedLimit),
      localRotationSpeedLimit: optional(speedLimit),
      particleSpeedLimit: optional(speedLimit),
      rootFollow: optional(unit),
      centrifugal: optional(unit),
      teleport: optional(
        z.discriminatedUnion('mode', [
          z.strictObject({ mode: z.literal('off') }),
          z.strictObject({ mode: z.enum(['reset', 'keep']), distance: optional(nonNegative), rotation: optional(between(0, 360)) }),
        ]),
      ),
    }),
  ),
  maxDistance: optional(z.discriminatedUnion('enabled', [off, z.strictObject({ enabled: on, distance })])),
  behindLimit: optional(
    z.discriminatedUnion('enabled', [
      off,
      z.strictObject({ enabled: on, radius: optional(nonNegative), distance: optional(distance), axis: optional(signedAxis) }),
    ]),
  ),
  motionStiffness: optional(unit),
  collision: optional(
    z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('off') }),
      z.strictObject({ mode: optional(z.enum(['point', 'edge'])), friction: optional(unit) }),
    ]),
  ),
  influence: optional(unit),
  settleTime: optional(nonNegative),
  rotationFollow: optional(unit),
  rootRotationFollow: optional(unit),
  animationBlend: optional(unit),
});

const colliderCommon = {
  id: optional(z.union([z.string(), finite])),
  transform: id,
  radius: positive,
  center: optional(triple),
  enabled: optional(z.boolean()),
};
const capsuleFields = {
  shape: z.literal('capsule'),
  length: nonNegative,
  endRadius: optional(positive),
  axis: optional(axis),
  align: optional(z.enum(['center', 'start'])),
  reverse: optional(z.boolean()),
};
const connection = z.enum(['chains', 'nearest', 'ring', 'strip']);
const normals = z.enum(['bone', 'outward']);
const ids = z.array(id);

export const sceneSpecSchema = z.strictObject({
  coordinates: optional(z.strictObject({ up: z.enum(['y', 'z']), handedness: z.enum(['left', 'right']) })),
  transforms: z
    .array(
      z.strictObject({
        id,
        name: optional(z.string()),
        parent: optional(id),
        position: optional(triple),
        rotation: optional(rotation),
        scale: optional(triple),
      }),
    )
    .check(z.minLength(1)),
  cloths: z.array(
    z.strictObject({
      name: optional(z.string()),
      roots: z.array(id).check(z.minLength(1)),
      anchor: id,
      connection: optional(connection),
      fixed: optional(ids),
      exclude: optional(ids),
      colliders: optional(z.array(z.union([z.string(), finite]))),
      settings: optional(settingsInputSchema),
      enabled: optional(z.boolean()),
      restPose: optional(z.array(z.strictObject({ id, position: triple, rotation: unitRotation, scale: optional(triple) }))),
      normals: optional(normals),
    }),
  ),
  colliders: optional(
    z.array(
      z.discriminatedUnion('shape', [
        z.strictObject({ ...colliderCommon, shape: z.literal('sphere') }),
        z.strictObject({ ...colliderCommon, ...capsuleFields }),
      ]),
    ),
  ),
});

const object3D = z.custom<Three.Object3D>((value) => typeof value === 'object' && value !== null && 'isObject3D' in value && value.isObject3D === true, {
  error: 'expected a three.js object',
});
const objects = z.array(object3D);
const threeColliderCommon = { object: object3D, radius: positive, center: optional(triple), enabled: optional(z.boolean()) };

export const threeSceneSpecSchema = z.strictObject({
  cloths: z.array(
    z.strictObject({
      name: optional(z.string()),
      bones: z.array(object3D).check(z.minLength(1)),
      anchor: optional(object3D),
      connection: optional(connection),
      fixed: optional(objects),
      exclude: optional(objects),
      colliders: optional(z.array(z.int().check(z.gte(0)))),
      settings: optional(settingsInputSchema),
      enabled: optional(z.boolean()),
      normals: optional(normals),
    }),
  ),
  colliders: optional(
    z.array(
      z.discriminatedUnion('shape', [
        z.strictObject({ ...threeColliderCommon, shape: z.literal('sphere') }),
        z.strictObject({ ...threeColliderCommon, ...capsuleFields }),
      ]),
    ),
  ),
});

export const systemOptionsSchema = z.strictObject({
  frequency: optional(z.number().check(z.gte(30), z.lte(150))),
  maxStepsPerFrame: optional(z.int().check(z.gte(1), z.lte(5))),
  debug: optional(z.boolean()),
  include: optional(z.custom<NonNullable<SystemOptions['include']>>((value) => typeof value === 'function', { error: 'expected a function' })),
});

// Compile-time checks that the schemas accept every typed input and produce the typed shape. The schemas' types are
// mutable, so the typed inputs are compared with them made read-only.
type Assignable<Target, Source extends Target> = [Target, Source];
type DeepReadonly<Value> = Value extends (...parameters: never[]) => unknown
  ? Value
  : Value extends readonly unknown[]
    ? { readonly [Index in keyof Value]: DeepReadonly<Value[Index]> }
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;
export type SceneSpecMatches = [Assignable<DeepReadonly<z.input<typeof sceneSpecSchema>>, SceneSpec>, Assignable<SceneSpec, z.output<typeof sceneSpecSchema>>];
export type SettingsMatch = [
  Assignable<DeepReadonly<z.input<typeof settingsInputSchema>>, ClothSettingsInput>,
  Assignable<ClothSettingsInput, z.output<typeof settingsInputSchema>>,
];
export type ThreeSceneSpecMatches = [
  Assignable<DeepReadonly<z.input<typeof threeSceneSpecSchema>>, ThreeSceneSpec>,
  Assignable<ThreeSceneSpec, z.output<typeof threeSceneSpecSchema>>,
];
export type OptionsMatch = [
  Assignable<DeepReadonly<z.input<typeof systemOptionsSchema>>, SystemOptions>,
  Assignable<SystemOptions, z.output<typeof systemOptionsSchema>>,
];

// Returns the parsed input or throws SmoothPhysicsError with the first problem and its path.
export function parseInput<Output>({
  schema,
  input,
  code,
  prefix,
}: {
  schema: z.ZodMiniType<Output>;
  input: unknown;
  code: ClothErrorCode;
  prefix?: string;
}): Output {
  const result = schema.safeParse(input, { error: localeError });
  if (result.success) return result.data;

  const message = describe(result.error.issues);
  throw new SmoothPhysicsError({ code, message: prefix ? `${prefix}: ${message}` : message });
}

// The first problem, with its path. A union reports the branch that got furthest before failing.
function describe(issues: readonly z.core.$ZodIssue[]): string {
  const first = issues[0];
  if (!first) return 'invalid input';
  const issue = deepest(first);
  return issue.path.length ? `${pathOf(issue.path)}: ${issue.message}` : issue.message;
}

// Follows the union branch whose first issue has the longest path, joining the paths on the way down.
function deepest(issue: z.core.$ZodIssue): z.core.$ZodIssue {
  if (issue.code !== 'invalid_union') return issue;
  let best: z.core.$ZodIssue | undefined;
  for (const branch of issue.errors) {
    const candidate = branch[0];
    if (candidate && candidate.path.length > (best?.path.length ?? 0)) best = candidate;
  }
  return best ? deepest({ ...best, path: [...issue.path, ...best.path] }) : issue;
}

// Writes a path as it would be written in code, for example cloths[0].settings.radius.
const pathOf = (path: readonly PropertyKey[]): string =>
  path.map((segment, index) => (typeof segment === 'number' ? `[${segment}]` : `${index ? '.' : ''}${String(segment)}`)).join('');
