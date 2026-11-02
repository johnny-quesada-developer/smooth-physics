// A built scene, as createClothScene returns it. Every value is in the solver's coordinates except
// ClothRecord.settings.
import type { Coordinates } from '../coordinates.ts';
import type { ClothSettings } from '../authoring.ts';

export type Vector3Record = { readonly x: number; readonly y: number; readonly z: number };
export type QuaternionRecord = { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
export type MatrixRecord = readonly number[];
// A transform id, or a collider's record id.
export type IdReference = { readonly referenceId: number };

// An infinite slope holds the key's value until the next key.
export type CurveKey = { readonly time: number; readonly value: number; readonly inSlope: number; readonly outSlope: number };
// Without a curve, value is the constant; with one, it scales every key.
export type CurveRecord = { readonly value: number; readonly isCurve: boolean; readonly keys: readonly CurveKey[] };
export type SpeedLimit = { readonly value: number; readonly use: boolean };

export type InertiaData = {
  readonly anchorFollow: number;
  readonly worldInertia: number;
  readonly movementInertiaSmoothing: number;
  readonly movementSpeedLimit: SpeedLimit;
  readonly rotationSpeedLimit: SpeedLimit;
  readonly localInertia: number;
  readonly localMovementSpeedLimit: SpeedLimit;
  readonly localRotationSpeedLimit: SpeedLimit;
  readonly rootFollowShare: number;
  readonly centrifugalShare: number;
  readonly particleSpeedLimit: SpeedLimit;
  readonly teleportMode: number;
  readonly teleportDistance: number;
  readonly teleportRotation: number;
};

// The numeric modes and axes are the indices that authoring.ts maps names to.
export type ClothConfiguration = {
  readonly connectionKind: number;
  readonly rootBones: readonly IdReference[];
  readonly gravity: number;
  readonly gravityDirection: Vector3Record;
  readonly gravityFalloff: number;
  readonly settleTime: number;
  readonly influenceWeight: number;
  readonly damping: CurveRecord;
  readonly radius: CurveRecord;
  readonly rotationFollow: number;
  readonly rootRotationFollow: number;
  readonly animationBlend: number;
  readonly inertia: InertiaData;
  readonly compressionLimit: number;
  readonly distanceStiffness: CurveRecord;
  readonly bendingStiffness: number;
  readonly restoration: {
    readonly use: boolean;
    readonly stiffness: CurveRecord;
    readonly velocityDamping: number;
    readonly gravityFalloff: number;
  };
  readonly angleLimit: { readonly use: boolean; readonly limitAngle: CurveRecord; readonly stiffness: number };
  readonly motion: {
    readonly useMaxDistance: boolean;
    readonly maxDistance: CurveRecord;
    readonly useBehindLimit: boolean;
    readonly behindLimitRadius: number;
    readonly behindLimitDistance: CurveRecord;
    readonly behindLimitAxis: number;
    readonly stiffness: number;
  };
  readonly colliderContact: { readonly mode: number; readonly friction: number; readonly colliders: readonly IdReference[] };
};

// The rest pose in world space, for the cloth's transforms followed by its anchor.
export type BindSetup = {
  readonly transformIds: readonly number[];
  readonly transformPositions: readonly Vector3Record[];
  readonly transformRotations: readonly QuaternionRecord[];
  readonly transformScales: readonly Vector3Record[];
  readonly anchorLocalToWorld: MatrixRecord;
  readonly anchorWorldToLocal: MatrixRecord;
  readonly anchorRotation: QuaternionRecord;
  readonly anchorScale: Vector3Record;
};

// Each cloth transform's rest position in the anchor's local space and its attribute flags.
export type Selection = {
  readonly positions: readonly Vector3Record[];
  readonly attributes: readonly number[];
};

export type ClothRecord = {
  readonly name: string;
  readonly enabled: boolean;
  readonly configuration: ClothConfiguration;
  readonly selection: Selection;
  readonly bind: BindSetup;
  readonly outwardNormals: boolean;
  // The resolved settings, in the scene's coordinates, that tuneCloth patches.
  readonly settings: ClothSettings;
};

export type ColliderRecord = {
  readonly type: 'sphere' | 'capsule';
  readonly transform: number;
  readonly enabled: boolean;
  readonly center: Vector3Record;
  // x is the radius (a capsule's start radius), y a capsule's end radius and z its length.
  readonly size: Vector3Record;
  // The index of the transform axis a capsule lies along: 0 x, 1 y, 2 z.
  readonly direction: number;
  readonly reverseDirection: boolean;
  readonly radiusSeparation: boolean;
  readonly alignedOnCenter: boolean;
};

export type TransformRecord = {
  readonly name: string;
  // 0 when the transform has no parent.
  readonly parent: number;
  readonly children: readonly number[];
  readonly localPosition: Vector3Record;
  readonly localRotation: QuaternionRecord;
  readonly localScale: Vector3Record;
};

export type ClothScene = {
  readonly coordinates: Coordinates;
  readonly transforms: ReadonlyMap<number, TransformRecord>;
  readonly cloths: readonly ClothRecord[];
  readonly colliders: ReadonlyMap<number, ColliderRecord>;
};
