import { lerp, lerpAngle } from './curves';

export type Side = 'l' | 'r';
// The character's left is +X and it faces +Z, so a left limb sits on the positive side.
export const SIDES: readonly Side[] = ['l', 'r'];
export const sign = (side: Side): number => (side === 'l' ? 1 : -1);

// Ankles are placed in the root frame (the floor point under the pelvis, turned by yaw), hands in the chest frame.
// Knee and elbow values push the joint outward. Angles are radians; a positive pitch leans or points forward.
const LINEAR_KEYS = [
  'x',
  'z',
  'pelvisX',
  'pelvisY',
  'pelvisZ',
  'lFootX',
  'lFootY',
  'lFootZ',
  'lKnee',
  'rFootX',
  'rFootY',
  'rFootZ',
  'rKnee',
  'lHandX',
  'lHandY',
  'lHandZ',
  'lElbow',
  'rHandX',
  'rHandY',
  'rHandZ',
  'rElbow',
] as const;
const ANGLE_KEYS = [
  'yaw',
  'pelvisPitch',
  'pelvisYaw',
  'pelvisRoll',
  'spinePitch',
  'spineYaw',
  'spineRoll',
  'chestPitch',
  'chestYaw',
  'chestRoll',
  'headPitch',
  'headYaw',
  'headRoll',
  'lFootYaw',
  'lFootPitch',
  'rFootYaw',
  'rFootPitch',
] as const;

export type PoseKey = (typeof LINEAR_KEYS)[number] | (typeof ANGLE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

export const STAND_HEIGHT = 0.93;
export const ANKLE_HEIGHT = 0.08;

// The stance every clip starts and ends in, at the middle of the stage facing the camera.
export function standingPose(): Pose {
  const pose = emptyPose();
  pose.pelvisY = STAND_HEIGHT;
  for (const side of SIDES) {
    const s = sign(side);
    pose[`${side}FootX`] = s * 0.13;
    pose[`${side}FootY`] = ANKLE_HEIGHT;
    pose[`${side}FootZ`] = 0.01;
    pose[`${side}FootYaw`] = s * 0.12;
    pose[`${side}Knee`] = 0.12;
    pose[`${side}HandX`] = s * 0.25;
    pose[`${side}HandY`] = -0.32;
    pose[`${side}HandZ`] = 0.05;
  }
  return pose;
}

function emptyPose(): Pose {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    pelvisX: 0,
    pelvisY: 0,
    pelvisZ: 0,
    pelvisPitch: 0,
    pelvisYaw: 0,
    pelvisRoll: 0,
    spinePitch: 0,
    spineYaw: 0,
    spineRoll: 0,
    chestPitch: 0,
    chestYaw: 0,
    chestRoll: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    lFootX: 0,
    lFootY: 0,
    lFootZ: 0,
    lFootYaw: 0,
    lFootPitch: 0,
    lKnee: 0,
    rFootX: 0,
    rFootY: 0,
    rFootZ: 0,
    rFootYaw: 0,
    rFootPitch: 0,
    rKnee: 0,
    lHandX: 0,
    lHandY: 0,
    lHandZ: 0,
    lElbow: 0,
    rHandX: 0,
    rHandY: 0,
    rHandZ: 0,
    rElbow: 0,
  };
}

export function copyPose({ from, to }: { from: Pose; to: Pose }): void {
  for (const key of LINEAR_KEYS) to[key] = from[key];
  for (const key of ANGLE_KEYS) to[key] = from[key];
}

export function blendPose({ from, to, amount, out }: { from: Pose; to: Pose; amount: number; out: Pose }): void {
  for (const key of LINEAR_KEYS) out[key] = lerp(from[key], to[key], amount);
  for (const key of ANGLE_KEYS) out[key] = lerpAngle(from[key], to[key], amount);
}
