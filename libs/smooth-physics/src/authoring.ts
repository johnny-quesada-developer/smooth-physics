// Scenes are described in the caller's coordinates (SceneSpec.coordinates, by default the solver's: left-handed,
// X right, Y up, Z away from the viewer), in metres, with rotations as [x, y, z, w]. Everything is validated once,
// here, and converted to the solver's coordinates.
import { fround } from './float32/scalar.ts';
import { composeMatrix, invertMatrix, multiplyMatrices, transformPoint, type Matrix4 } from './float32/matrix.ts';
import { multiplyQuaternions, normalizeQuaternion, type Quaternion } from './float32/quaternion.ts';
import { multiplyVectors, type Vector3 } from './float32/vector.ts';
import { Axes, SOLVER_COORDINATES, type Axis, type Coordinates, type SignedAxis } from './coordinates.ts';
import { parseInput, sceneSpecSchema, settingsInputSchema } from './spec-schemas.ts';
import { SmoothPhysicsError } from './errors.ts';
import type {
  ClothScene,
  CurveKey,
  ClothConfiguration,
  ClothRecord,
  ColliderRecord,
  CurveRecord,
  TransformRecord,
  Vector3Record,
  SpeedLimit as SpeedLimitRecord,
} from './scene-format/types.ts';

export type Triple = readonly [number, number, number];
export type Rotation = readonly [number, number, number, number];
export type ClothConnection = 'chains' | 'nearest' | 'ring' | 'strip';
export type BoneAxis = SignedAxis;
// 'step' holds the key's value until the next key.
export type CurvePoint = { readonly time: number; readonly value: number; readonly inSlope: number | 'step'; readonly outSlope: number | 'step' };
// Keys run from the root (time 0) to the tip (time 1); scale multiplies every value.
export type CurveSpec = { readonly scale?: number; readonly keys: readonly CurvePoint[] };
// A constant, a straight line from the root to the tip, or a curve.
export type Range = number | readonly [start: number, end: number] | CurveSpec;
export type SpeedLimit = number | 'off';

export type Off = { readonly enabled: false };
export type On<Group> = { readonly enabled: true } & Group;
// A group given as input: off, or on with any of its values (the others take ENABLED_DEFAULTS).
export type Switch<Group> = Off | ({ readonly enabled?: true } & { readonly [Key in keyof Group]?: Group[Key] });

export type RestorationSettings = { readonly stiffness: Range; readonly velocityDamping: number; readonly gravityFalloff: number };
export type AngleLimitSettings = { readonly degrees: Range; readonly stiffness: number };
export type MaxDistanceSettings = { readonly distance: Range };
export type BehindLimitSettings = { readonly radius: number; readonly distance: Range; readonly axis: BoneAxis };
export type Collision = { readonly mode: 'off' } | { readonly mode: 'point' | 'edge'; readonly friction: number };
export type Teleport = { readonly mode: 'off' } | { readonly mode: 'reset' | 'keep'; readonly distance: number; readonly rotation: number };
export type InertiaSettings = {
  readonly world: number;
  readonly local: number;
  readonly anchor: number;
  readonly smoothing: number;
  readonly movementSpeedLimit: SpeedLimit;
  readonly rotationSpeedLimit: SpeedLimit;
  readonly localMovementSpeedLimit: SpeedLimit;
  readonly localRotationSpeedLimit: SpeedLimit;
  readonly particleSpeedLimit: SpeedLimit;
  readonly rootFollow: number;
  readonly centrifugal: number;
  readonly teleport: Teleport;
};

export type ClothSettings = {
  readonly gravity: number;
  readonly gravityDirection: Triple;
  readonly gravityFalloff: number;
  readonly damping: Range;
  readonly radius: Range;
  readonly stiffness: Range;
  readonly compressionLimit: number;
  readonly bendingStiffness: number;
  readonly restoration: Off | On<RestorationSettings>;
  readonly angleLimit: Off | On<AngleLimitSettings>;
  readonly inertia: InertiaSettings;
  readonly maxDistance: Off | On<MaxDistanceSettings>;
  readonly behindLimit: Off | On<BehindLimitSettings>;
  readonly motionStiffness: number;
  readonly collision: Collision;
  readonly influence: number;
  readonly settleTime: number;
  readonly rotationFollow: number;
  readonly rootRotationFollow: number;
  readonly animationBlend: number;
};

export type TeleportInput = { readonly mode: 'off' } | { readonly mode: 'reset' | 'keep'; readonly distance?: number; readonly rotation?: number };
export type CollisionInput = { readonly mode: 'off' } | { readonly mode?: 'point' | 'edge'; readonly friction?: number };
type Grouped = 'restoration' | 'angleLimit' | 'inertia' | 'maxDistance' | 'behindLimit' | 'collision';
export type ClothSettingsInput = { readonly [Key in Exclude<keyof ClothSettings, Grouped>]?: ClothSettings[Key] } & {
  readonly restoration?: Switch<RestorationSettings>;
  readonly angleLimit?: Switch<AngleLimitSettings>;
  readonly inertia?: { readonly [Key in Exclude<keyof InertiaSettings, 'teleport'>]?: InertiaSettings[Key] } & { readonly teleport?: TeleportInput };
  // A maximum distance has no sensible default, so turning it on needs one.
  readonly maxDistance?: Off | ({ readonly enabled?: true } & MaxDistanceSettings);
  readonly behindLimit?: Switch<BehindLimitSettings>;
  readonly collision?: CollisionInput;
};

export const DEFAULT_SETTINGS: ClothSettings = {
  gravity: 5,
  gravityDirection: [0, -1, 0],
  gravityFalloff: 0,
  damping: 0.05,
  radius: 0.02,
  stiffness: [1, 0.5],
  compressionLimit: 0.4,
  bendingStiffness: 1,
  restoration: { enabled: true, stiffness: [0.2, 0.04], velocityDamping: 0.8, gravityFalloff: 0 },
  angleLimit: { enabled: false },
  inertia: {
    world: 1,
    local: 1,
    anchor: 0,
    smoothing: 0.2,
    movementSpeedLimit: 5,
    rotationSpeedLimit: 720,
    localMovementSpeedLimit: 'off',
    localRotationSpeedLimit: 'off',
    particleSpeedLimit: 4,
    rootFollow: 0,
    centrifugal: 0,
    teleport: { mode: 'off' },
  },
  maxDistance: { enabled: false },
  behindLimit: { enabled: false },
  motionStiffness: 1,
  collision: { mode: 'point', friction: 0.05 },
  influence: 1,
  settleTime: 0.1,
  rotationFollow: 0.5,
  rootRotationFollow: 0.5,
  animationBlend: 0,
};

// The values a group takes when it is turned on without them, with Y up.
export type EnabledDefaults = {
  readonly restoration: RestorationSettings;
  readonly angleLimit: AngleLimitSettings;
  readonly behindLimit: BehindLimitSettings;
  readonly collision: { readonly mode: 'point' | 'edge'; readonly friction: number };
  readonly teleport: { readonly distance: number; readonly rotation: number };
};
export const ENABLED_DEFAULTS: EnabledDefaults = {
  restoration: { stiffness: [0.2, 0.04], velocityDamping: 0.8, gravityFalloff: 0 },
  angleLimit: { degrees: [0, 60], stiffness: 1 },
  behindLimit: { radius: 10, distance: 0, axis: 'y' },
  collision: { mode: 'point', friction: 0.05 },
  teleport: { distance: 0.5, rotation: 90 },
};

// Defaults that point somewhere follow the scene's up axis: gravity pulls down it and the behind limit uses it.
type Defaults = { readonly settings: ClothSettings; readonly enabled: EnabledDefaults };
const Y_UP: Defaults = { settings: DEFAULT_SETTINGS, enabled: ENABLED_DEFAULTS };
const Z_UP: Defaults = {
  settings: { ...DEFAULT_SETTINGS, gravityDirection: [0, 0, -1] },
  enabled: { ...ENABLED_DEFAULTS, behindLimit: { ...ENABLED_DEFAULTS.behindLimit, axis: 'z' } },
};
const defaultsFor = (up: Coordinates['up']): Defaults => (up === 'z' ? Z_UP : Y_UP);

export type TransformSpec = {
  readonly id: number;
  readonly name?: string;
  readonly parent?: number;
  readonly position?: Triple;
  readonly rotation?: Rotation;
  readonly scale?: Triple;
};
// A world pose. Its rotation is used as given, so it must already be a unit quaternion.
export type RestPoseSpec = { readonly id: number; readonly position: Triple; readonly rotation: Rotation; readonly scale?: Triple };
type ColliderCommon = {
  readonly id?: string | number;
  readonly transform: number;
  readonly radius: number;
  readonly center?: Triple;
  readonly enabled?: boolean;
};
export type SphereColliderSpec = ColliderCommon & { readonly shape: 'sphere' };
// A capsule lies along an axis of its transform; endRadius tapers it toward the far end.
export type CapsuleColliderSpec = ColliderCommon & {
  readonly shape: 'capsule';
  readonly length: number;
  readonly endRadius?: number;
  readonly axis?: Axis;
  readonly align?: 'center' | 'start';
  readonly reverse?: boolean;
};
export type ColliderSpec = SphereColliderSpec | CapsuleColliderSpec;
export type ClothSpec = {
  readonly name?: string;
  readonly roots: readonly number[];
  readonly anchor: number;
  readonly connection?: ClothConnection;
  readonly fixed?: readonly number[];
  readonly exclude?: readonly number[];
  readonly colliders?: readonly (string | number)[];
  readonly settings?: ClothSettingsInput;
  readonly enabled?: boolean;
  // The pose the cloth is built in, for every cloth transform and the anchor. Defaults to the transforms' pose.
  readonly restPose?: readonly RestPoseSpec[];
  // 'bone' takes each particle's normal from its bone; 'outward' points normals away from the cloth's centre.
  readonly normals?: 'bone' | 'outward';
};
export type SceneSpec = {
  readonly coordinates?: Coordinates;
  readonly transforms: readonly TransformSpec[];
  readonly cloths: readonly ClothSpec[];
  readonly colliders?: readonly ColliderSpec[];
};
const CONNECTIONS: Readonly<Record<ClothConnection, number>> = { chains: 0, nearest: 1, ring: 2, strip: 3 };
const COLLISION_MODES = { off: 0, point: 1, edge: 2 };
const TELEPORT_MODES = { off: 0, reset: 1, keep: 2 };
const SIGNED_AXIS_INDEX: Readonly<Record<SignedAxis, number>> = { x: 0, y: 1, z: 2, '-x': 3, '-y': 4, '-z': 5 };
const MAXIMUM_PARTICLES = 4096;

// Throws SmoothPhysicsError ('INVALID_CLOTH_SPEC') for anything it cannot build exactly as described.
export function createClothScene(input: SceneSpec): ClothScene {
  const spec: SceneSpec = parseInput({ schema: sceneSpecSchema, input, code: 'INVALID_CLOTH_SPEC' });
  return buildScene(spec);
}

// Settings in the caller's coordinates, merged over the defaults for that up axis.
export function resolveSettings({
  settings = {},
  name = 'cloth',
  up = 'y',
}: {
  settings?: ClothSettingsInput;
  name?: string;
  up?: Coordinates['up'];
}): ClothSettings {
  return mergeSettings({ settings: parseSettings({ settings, name }), defaults: defaultsFor(up) });
}

// A change to a cloth's resolved settings: what the patch leaves out keeps its current value, and a group turned
// on takes its current values, or its defaults if it was off.
export function patchSettings({
  current,
  patch,
  name,
  up,
}: {
  current: ClothSettings;
  patch: ClothSettingsInput;
  name: string;
  up: Coordinates['up'];
}): ClothSettings {
  const { enabled } = defaultsFor(up);
  return mergeSettings({
    settings: parseSettings({ settings: patch, name }),
    defaults: {
      settings: current,
      enabled: {
        restoration: current.restoration.enabled ? current.restoration : enabled.restoration,
        angleLimit: current.angleLimit.enabled ? current.angleLimit : enabled.angleLimit,
        behindLimit: current.behindLimit.enabled ? current.behindLimit : enabled.behindLimit,
        collision: current.collision.mode === 'off' ? enabled.collision : current.collision,
        teleport: current.inertia.teleport.mode === 'off' ? enabled.teleport : current.inertia.teleport,
      },
    },
  });
}

// The solver's configuration for resolved settings, in the solver's coordinates.
export function settingsConfiguration({ settings, axes }: { settings: ClothSettings; axes: Axes }): ClothConfiguration {
  return configurationOf({ settings, roots: [], colliders: [], connection: 0, axes, defaults: defaultsFor(axes.coordinates.up) });
}

function parseSettings({ settings, name }: { settings: ClothSettingsInput; name: string }): ClothSettingsInput {
  return parseInput({ schema: settingsInputSchema, input: settings, code: 'INVALID_CLOTH_SPEC', prefix: `${name} settings` });
}

type WorldPose = { readonly position: Vector3; readonly rotation: Quaternion; readonly scale: Vector3; readonly matrix: Matrix4 };

function buildScene({ coordinates = SOLVER_COORDINATES, transforms, cloths, colliders = [] }: SceneSpec): ClothScene {
  const axes = new Axes(coordinates);
  const records = readTransforms({ transforms, axes });
  const world = new Map<number, WorldPose>();
  for (const id of records.keys()) composeWorld({ id, records, world, visiting: new Set() });
  const { colliderRecords, colliderIds } = readColliders({ colliders, records, axes });
  const clothRecords = cloths.map((cloth, index) => buildCloth({ cloth, index, records, world, colliderIds, axes }));
  return { coordinates, transforms: records, cloths: clothRecords, colliders: colliderRecords };
}

function readTransforms({ transforms, axes }: { transforms: readonly TransformSpec[]; axes: Axes }): Map<number, TransformRecord> {
  const records = new Map<number, TransformRecord>();
  for (const transform of transforms) {
    if (records.has(transform.id)) fail(`Duplicate transform id ${transform.id}.`);
    const position = float32(axes.vectorToSolver(transform.position ?? [0, 0, 0]));
    const [rotationX, rotationY, rotationZ, rotationW] = axes.rotationToSolver(transform.rotation ?? [0, 0, 0, 1]);
    const rotation = normalizeQuaternion([fround(rotationX), fround(rotationY), fround(rotationZ), fround(rotationW)]);
    const scale = float32(axes.scaleToSolver(transform.scale ?? [1, 1, 1]));
    records.set(transform.id, {
      name: transform.name ?? `t${transform.id}`,
      // Transform ids are positive, so parent 0 means none.
      parent: transform.parent ?? 0,
      children: [],
      localPosition: toSerialized(position),
      localRotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
      localScale: toSerialized(scale),
    });
  }

  const children = new Map<number, number[]>();
  for (const [id, record] of records) {
    if (!record.parent) continue;
    if (!records.has(record.parent)) fail(`Transform ${id} has unknown parent ${record.parent}.`);
    children.set(record.parent, [...(children.get(record.parent) ?? []), id]);
  }
  for (const [id, record] of records) records.set(id, { ...record, children: children.get(id) ?? [] });
  return records;
}

function composeWorld({
  id,
  records,
  world,
  visiting,
}: {
  id: number;
  records: ReadonlyMap<number, TransformRecord>;
  world: Map<number, WorldPose>;
  visiting: Set<number>;
}): WorldPose {
  const known = world.get(id);
  if (known) return known;
  if (visiting.has(id)) fail(`Transform ${id} is part of a parent cycle.`);
  visiting.add(id);
  const record = records.get(id);
  if (!record) return fail(`Unknown transform ${id}.`);

  const localPosition: Vector3 = [record.localPosition.x, record.localPosition.y, record.localPosition.z];
  const localRotation: Quaternion = [record.localRotation.x, record.localRotation.y, record.localRotation.z, record.localRotation.w];
  const localScale: Vector3 = [record.localScale.x, record.localScale.y, record.localScale.z];
  const parent: WorldPose = record.parent
    ? composeWorld({ id: record.parent, records, world, visiting })
    : { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], matrix: composeMatrix([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]) };

  const matrix = multiplyMatrices(parent.matrix, composeMatrix(localPosition, localRotation, localScale));
  const pose: WorldPose = {
    position: [matrix[12], matrix[13], matrix[14]],
    rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, localRotation)),
    scale: multiplyVectors(parent.scale, localScale),
    matrix,
  };
  world.set(id, pose);
  return pose;
}

function readColliders({ colliders, records, axes }: { colliders: readonly ColliderSpec[]; records: ReadonlyMap<number, TransformRecord>; axes: Axes }): {
  colliderRecords: Map<number, ColliderRecord>;
  colliderIds: Map<string | number, number>;
} {
  const colliderRecords = new Map<number, ColliderRecord>();
  const colliderIds = new Map<string | number, number>();
  colliders.forEach((collider, index) => {
    const key = collider.id ?? `collider${index + 1}`;
    if (colliderIds.has(key)) fail(`Duplicate collider id ${key}.`);
    if (!records.has(collider.transform)) fail(`Collider ${key} uses unknown transform ${collider.transform}.`);
    // Cloths refer to colliders and transforms by id, so collider ids take a range of their own.
    const recordId = 1e9 + index;
    colliderIds.set(key, recordId);
    const center = toSerialized(float32(axes.vectorToSolver(collider.center ?? [0, 0, 0])));

    if (collider.shape === 'sphere') {
      colliderRecords.set(recordId, {
        type: 'sphere',
        transform: collider.transform,
        enabled: collider.enabled !== false,
        center,
        size: { x: collider.radius, y: collider.radius, z: 0 },
        direction: SIGNED_AXIS_INDEX.y,
        reverseDirection: false,
        radiusSeparation: false,
        alignedOnCenter: true,
      });
      return;
    }

    // The capsule keeps pointing the same way: an axis that turns negative in the solver's coordinates flips reverse.
    const solverAxis = axes.axisToSolver(collider.axis ?? 'y');
    colliderRecords.set(recordId, {
      type: 'capsule',
      transform: collider.transform,
      enabled: collider.enabled !== false,
      center,
      size: { x: collider.radius, y: collider.endRadius ?? collider.radius, z: collider.length },
      direction: SIGNED_AXIS_INDEX[solverAxis] % 3,
      reverseDirection: (collider.reverse === true) !== solverAxis.startsWith('-'),
      radiusSeparation: collider.endRadius !== undefined && collider.endRadius !== collider.radius,
      alignedOnCenter: (collider.align ?? 'center') === 'center',
    });
  });
  return { colliderRecords, colliderIds };
}

function buildCloth({
  cloth,
  index,
  records,
  world,
  colliderIds,
  axes,
}: {
  cloth: ClothSpec;
  index: number;
  records: ReadonlyMap<number, TransformRecord>;
  world: ReadonlyMap<number, WorldPose>;
  colliderIds: ReadonlyMap<string | number, number>;
  axes: Axes;
}): ClothRecord {
  const label = cloth.name ?? `cloth${index + 1}`;
  if (cloth.roots.some((id) => !records.has(id))) fail(`${label}: roots must name existing transforms.`);
  if (!world.has(cloth.anchor)) fail(`${label}: anchor must name an existing transform.`);
  const particleIds = clothTransformOrder({ roots: cloth.roots, records, label });
  if (particleIds.length > MAXIMUM_PARTICLES) fail(`${label}: more than ${MAXIMUM_PARTICLES} particles.`);

  const included = new Set(particleIds);
  const fixed = new Set(cloth.fixed ?? cloth.roots);
  const excluded = new Set(cloth.exclude ?? []);
  for (const id of [...fixed, ...excluded]) if (!included.has(id)) fail(`${label}: fixed or excluded transform ${id} is not part of this cloth.`);

  const defaults = defaultsFor(axes.coordinates.up);
  const settings = mergeSettings({ settings: cloth.settings ?? {}, defaults });
  const colliderReferenceIds = (cloth.colliders ?? []).map((key) => colliderIds.get(key) ?? fail(`${label}: unknown collider ${key}.`));

  const boundIds = [...particleIds, cloth.anchor];
  const restPoses = cloth.restPose ? readRestPose({ restPose: cloth.restPose, ids: boundIds, label, axes }) : world;
  const restPoseOf = (id: number): WorldPose => restPoses.get(id) ?? fail(`${label}: unknown transform ${id}.`);
  const anchor = restPoseOf(cloth.anchor);
  // Particle positions are stored in the anchor's local space.
  const localToWorld = anchor.matrix;
  const worldToLocal = invertMatrix(localToWorld);

  return {
    name: label,
    enabled: cloth.enabled !== false,
    configuration: configurationOf({
      settings,
      roots: cloth.roots,
      colliders: colliderReferenceIds,
      connection: CONNECTIONS[cloth.connection ?? 'chains'],
      axes,
      defaults,
    }),
    selection: {
      positions: particleIds.map((id) => toSerialized(transformPoint(worldToLocal, restPoseOf(id).position))),
      // The attribute flags: 0 excluded, 1 pinned, 2 simulated.
      attributes: particleIds.map((id) => (excluded.has(id) ? 0 : fixed.has(id) ? 1 : 2)),
    },
    bind: {
      transformIds: boundIds,
      transformPositions: boundIds.map((id) => toSerialized(restPoseOf(id).position)),
      transformRotations: boundIds.map((id) => {
        const rotation = restPoseOf(id).rotation;
        return { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] };
      }),
      transformScales: boundIds.map((id) => toSerialized(restPoseOf(id).scale)),
      anchorLocalToWorld: localToWorld,
      anchorWorldToLocal: worldToLocal,
      anchorRotation: { x: anchor.rotation[0], y: anchor.rotation[1], z: anchor.rotation[2], w: anchor.rotation[3] },
      anchorScale: toSerialized(anchor.scale),
    },
    outwardNormals: cloth.normals === 'outward',
    settings,
  };
}

function readRestPose({
  restPose,
  ids,
  label,
  axes,
}: {
  restPose: readonly RestPoseSpec[];
  ids: readonly number[];
  label: string;
  axes: Axes;
}): Map<number, WorldPose> {
  const wanted = new Set(ids);
  const poses = new Map<number, WorldPose>();
  for (const pose of restPose) {
    if (!wanted.has(pose.id)) fail(`${label}: restPose transform ${pose.id} is not part of this cloth.`);
    if (poses.has(pose.id)) fail(`${label}: restPose lists transform ${pose.id} twice.`);
    const position = float32(axes.vectorToSolver(pose.position));
    const scale = float32(axes.scaleToSolver(pose.scale ?? [1, 1, 1]));
    const [rotationX, rotationY, rotationZ, rotationW] = axes.rotationToSolver(pose.rotation);
    const rotation: Quaternion = [fround(rotationX), fround(rotationY), fround(rotationZ), fround(rotationW)];
    poses.set(pose.id, { position, rotation, scale, matrix: composeMatrix(position, rotation, scale) });
  }
  for (const id of ids) if (!poses.has(id)) fail(`${label}: restPose is missing transform ${id}.`);
  return poses;
}

// Depth first from the last root: the mesh build depends on this order.
function clothTransformOrder({ roots, records, label }: { roots: readonly number[]; records: ReadonlyMap<number, TransformRecord>; label: string }): number[] {
  const orderedIds: number[] = [];
  const stack = [...roots];
  const seen = new Set<number>();
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (seen.has(id)) fail(`${label}: transform ${id} is reached twice; roots must not contain each other.`);
    seen.add(id);
    orderedIds.push(id);
    stack.push(...(records.get(id)?.children ?? []));
  }
  return orderedIds;
}

function mergeSettings({ settings, defaults: { settings: base, enabled } }: { settings: ClothSettingsInput; defaults: Defaults }): ClothSettings {
  const { restoration, angleLimit, inertia, maxDistance, behindLimit, collision, ...ungrouped } = settings;
  const { teleport, ...inertiaValues } = inertia ?? {};
  return {
    ...base,
    ...ungrouped,
    restoration: switched({ input: restoration, fallback: base.restoration, enabled: enabled.restoration }),
    angleLimit: switched({ input: angleLimit, fallback: base.angleLimit, enabled: enabled.angleLimit }),
    inertia: { ...base.inertia, ...inertiaValues, teleport: teleportOf({ input: teleport, base, enabled }) },
    maxDistance: maxDistance === undefined ? base.maxDistance : maxDistance.enabled === false ? maxDistance : { ...maxDistance, enabled: true },
    behindLimit: switched({ input: behindLimit, fallback: base.behindLimit, enabled: enabled.behindLimit }),
    collision: collisionOf({ input: collision, base, enabled }),
  };
}

function switched<Group extends object>({
  input,
  fallback,
  enabled,
}: {
  input: Switch<Group> | undefined;
  fallback: Off | On<Group>;
  enabled: Group;
}): Off | On<Group> {
  if (input === undefined) return fallback;
  if (input.enabled === false) return { enabled: false };
  return { ...enabled, ...input, enabled: true };
}

function teleportOf({ input, base, enabled }: { input: TeleportInput | undefined; base: ClothSettings; enabled: EnabledDefaults }): Teleport {
  if (input === undefined) return base.inertia.teleport;
  if (input.mode === 'off') return input;
  return { mode: input.mode, distance: input.distance ?? enabled.teleport.distance, rotation: input.rotation ?? enabled.teleport.rotation };
}

function collisionOf({ input, base, enabled }: { input: CollisionInput | undefined; base: ClothSettings; enabled: EnabledDefaults }): Collision {
  if (input === undefined) return base.collision;
  if (input.mode === 'off') return { mode: 'off' };
  return { mode: input.mode ?? enabled.collision.mode, friction: input.friction ?? enabled.collision.friction };
}

function configurationOf({
  settings,
  roots,
  colliders,
  connection,
  axes,
  defaults: { enabled },
}: {
  settings: ClothSettings;
  roots: readonly number[];
  colliders: readonly number[];
  connection: number;
  axes: Axes;
  defaults: Defaults;
}): ClothConfiguration {
  const { restoration, angleLimit, maxDistance, behindLimit, collision, inertia } = settings;
  // A group that is off is never read; it keeps the values it would take when turned on.
  const restorationValues = restoration.enabled ? restoration : enabled.restoration;
  const angleLimitValues = angleLimit.enabled ? angleLimit : enabled.angleLimit;
  const behindValues = behindLimit.enabled ? behindLimit : enabled.behindLimit;
  const teleport = inertia.teleport.mode === 'off' ? enabled.teleport : inertia.teleport;

  return {
    connectionKind: connection,
    rootBones: roots.map((referenceId) => ({ referenceId })),
    gravity: settings.gravity,
    gravityDirection: toSerialized(float32(axes.vectorToSolver(settings.gravityDirection))),
    gravityFalloff: settings.gravityFalloff,
    settleTime: settings.settleTime,
    influenceWeight: settings.influence,
    damping: curve(settings.damping, 'damping'),
    radius: curve(settings.radius, 'radius'),
    rotationFollow: settings.rotationFollow,
    rootRotationFollow: settings.rootRotationFollow,
    animationBlend: settings.animationBlend,
    inertia: {
      anchorFollow: inertia.anchor,
      worldInertia: inertia.world,
      movementInertiaSmoothing: inertia.smoothing,
      movementSpeedLimit: limit(inertia.movementSpeedLimit),
      rotationSpeedLimit: limit(inertia.rotationSpeedLimit),
      localInertia: inertia.local,
      localMovementSpeedLimit: limit(inertia.localMovementSpeedLimit),
      localRotationSpeedLimit: limit(inertia.localRotationSpeedLimit),
      rootFollowShare: inertia.rootFollow,
      centrifugalShare: inertia.centrifugal,
      particleSpeedLimit: limit(inertia.particleSpeedLimit),
      teleportMode: TELEPORT_MODES[inertia.teleport.mode],
      teleportDistance: teleport.distance,
      teleportRotation: teleport.rotation,
    },
    compressionLimit: settings.compressionLimit,
    distanceStiffness: curve(settings.stiffness, 'stiffness'),
    bendingStiffness: settings.bendingStiffness,
    restoration: {
      use: restoration.enabled,
      stiffness: curve(restorationValues.stiffness, 'restoration.stiffness'),
      velocityDamping: restorationValues.velocityDamping,
      gravityFalloff: restorationValues.gravityFalloff,
    },
    angleLimit: { use: angleLimit.enabled, limitAngle: curve(angleLimitValues.degrees, 'angleLimit.degrees'), stiffness: angleLimitValues.stiffness },
    motion: {
      useMaxDistance: maxDistance.enabled,
      maxDistance: curve(maxDistance.enabled ? maxDistance.distance : 0, 'maxDistance.distance'),
      useBehindLimit: behindLimit.enabled,
      behindLimitRadius: behindValues.radius,
      behindLimitDistance: curve(behindValues.distance, 'behindLimit.distance'),
      behindLimitAxis: SIGNED_AXIS_INDEX[axes.axisToSolver(behindValues.axis)],
      stiffness: settings.motionStiffness,
    },
    colliderContact: {
      mode: COLLISION_MODES[collision.mode],
      friction: collision.mode === 'off' ? enabled.collision.friction : collision.friction,
      colliders: colliders.map((referenceId) => ({ referenceId })),
    },
  };
}

// [start, end] is a straight line from the root (0) to the tip (1).
function curve(value: Range, name: string): CurveRecord {
  if (typeof value === 'number') return { value, isCurve: false, keys: [] };
  if (!isPair(value)) return curveOf(value, name);
  const [start, end] = value;
  if (start === end) return { value: start, isCurve: false, keys: [] };
  const lineSlope = end - start;
  const keys: CurveKey[] = [
    { time: 0, value: start, inSlope: lineSlope, outSlope: lineSlope },
    { time: 1, value: end, inSlope: lineSlope, outSlope: lineSlope },
  ];
  return { value: 1, isCurve: true, keys };
}

function curveOf({ scale = 1, keys }: CurveSpec, name: string): CurveRecord {
  const curveKeys = keys.map((key, index): CurveKey => {
    if (index > 0 && !(key.time > (keys[index - 1]?.time ?? -Infinity))) fail(`${name} key times must increase.`);
    return { time: key.time, value: key.value, inSlope: slope(key.inSlope), outSlope: slope(key.outSlope) };
  });
  return { value: scale, isCurve: true, keys: curveKeys };
}

// The curve evaluator holds a key's value across an infinite slope.
const slope = (value: number | 'step'): number => (value === 'step' ? Infinity : value);
const isPair = (value: Exclude<Range, number>): value is readonly [number, number] => Array.isArray(value);
const limit = (value: SpeedLimit): SpeedLimitRecord => (value === 'off' ? { value: 0, use: false } : { value, use: true });
const toSerialized = (value: readonly [number, number, number]): Vector3Record => ({ x: value[0], y: value[1], z: value[2] });
const float32 = (value: readonly [number, number, number]): Vector3 => [fround(value[0]), fround(value[1]), fround(value[2])];

function fail(message: string): never {
  throw new SmoothPhysicsError({ code: 'INVALID_CLOTH_SPEC', message });
}
