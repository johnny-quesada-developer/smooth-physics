import type { ColliderTypeValue, ColliderWork } from './collision.ts';
import type { Matrix4 } from './float32/matrix.ts';
import type { Quaternion } from './float32/quaternion.ts';
import type { Vector3 } from './float32/vector.ts';

// A pose source may return the same arrays every frame, written in place: what the library keeps, it copies.
export type Pose = { readonly position: Vector3; readonly rotation: Quaternion; readonly scale: Vector3; readonly matrix: Matrix4 };
export type PoseSource = (transformId: number) => Pose;

// 'add' adds velocity and 'set' replaces it. By default the push is smaller near the roots; uniform gives every
// particle the same push.
export type ForceMode = 'add' | 'set';
export type ForceInput = { readonly force: readonly [number, number, number]; readonly mode?: ForceMode; readonly uniform?: boolean };

// A collider and its poses in the solver's coordinates: at the frame, at the step (current), and the previous of each.
// The collider owns its pose arrays: they are updated in place, never shared with another field or with a pose.
export type ClothCollider = {
  readonly transformId: number;
  readonly type: ColliderTypeValue;
  readonly reverse: boolean;
  readonly size: Vector3;
  readonly center: Vector3;
  enabled: boolean;
  framePosition: Vector3;
  frameRotation: Quaternion;
  frameScale: Vector3;
  oldFramePosition: Vector3;
  oldFrameRotation: Quaternion;
  currentPosition: Vector3;
  currentRotation: Quaternion;
  oldPosition: Vector3;
  oldRotation: Quaternion;
  // Derived each step for the collision kernels.
  work: ColliderWork | null;
  reset: boolean;
  // The frame position the quality controller saw last, for measuring collider speed.
  lastSeenPosition: Vector3 | null;
};

export type ClothTiming = {
  time: number;
  oldTime: number;
  stepTime: number;
  oldStepTime: number;
  intervalEndTime: number;
  intervalStartTime: number;
  reset: boolean;
  timeReset: boolean;
  anchorShifted: boolean;
  running: boolean;
  teleportShift: boolean;
  stepCount: number;
  skippedSteps: number;
  frameDeltaTime: number;
  appliedTimeScale: number;
  timeScale: number;
  stepFraction: number;
  settleWeight: number;
  influenceWeight: number;
  fadeWeight: number;
  gravityAlignment: number;
  gravityFalloffRatio: number;
  worldScaleRatio: number;
  readonly restScale: Vector3;
  // 0 for no force; otherwise a code from FORCE_CODES in simulated-cloth.ts, applied to pendingForce.
  forceMode: number;
  pendingForce: Vector3;
};

// The center owns its pose arrays: they are updated in place, never shared with another field or with a pose.
export type ClothCenter = {
  anchorWorldPosition: Vector3;
  anchorWorldRotation: Quaternion;
  anchorWorldScale: Vector3;
  oldAnchorWorldPosition: Vector3;
  oldAnchorWorldRotation: Quaternion;
  oldAnchorWorldScale: Vector3;
  frameCenterPosition: Vector3;
  frameCenterRotation: Quaternion;
  frameCenterScale: Vector3;
  oldFrameCenterPosition: Vector3;
  oldFrameCenterRotation: Quaternion;
  oldFrameCenterScale: Vector3;
  stepCenterPosition: Vector3;
  stepCenterRotation: Quaternion;
  oldStepCenterPosition: Vector3;
  oldStepCenterRotation: Quaternion;
  smoothedAnchorVelocity: Vector3;
  frameAnchorShift: Vector3;
  frameAnchorShiftRotation: Quaternion;
  stepCenterShift: Vector3;
  stepCenterShiftRotation: Quaternion;
  stepMovementInertia: number;
  stepRotationInertia: number;
  stepInertiaShift: Vector3;
  stepInertiaRotation: Quaternion;
  angularVelocity: number;
  rotationAxis: Vector3;
  restLocalGravityDirection: Vector3;
};

export type ClothStatistics = { steps: number; contacts: number; resets: number };

// 'default' runs 64-bit math without rounding, the fastest choice. 'rounded' rounds every operation to 32 bits, so a
// run repeats recorded results bit for bit.
export type Precision = 'default' | 'rounded';
// Earlier names, still accepted: 'f32' means 'rounded' and 'f64' means 'default'.
export type PrecisionInput = Precision | 'f32' | 'f64';
export type FrequencyScale = readonly [number, number, number, number];
