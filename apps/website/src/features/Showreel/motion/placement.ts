import * as THREE from 'three';
import { chestFrame, pelvisFrame, type BodyFrame } from '../rig/ninja';
import { toRoot, type FootSample, type RootSample } from './footwork';
import type { Pose, Side } from './pose';

const frame: BodyFrame = { position: new THREE.Vector3(), rotation: new THREE.Quaternion() };
const point = new THREE.Vector3();
const inverse = new THREE.Quaternion();

export function placeRoot({ pose, root }: { pose: Pose; root: RootSample }): void {
  pose.x = root.x;
  pose.z = root.z;
  pose.yaw = root.yaw;
}

// A foot sampled in world coordinates, written into the pose relative to its root.
export function placeFoot({ pose, side, foot }: { pose: Pose; side: Side; foot: FootSample }): void {
  const local = toRoot({ root: pose, x: foot.x, z: foot.z });
  pose[`${side}FootX`] = local.x;
  pose[`${side}FootY`] = foot.y;
  pose[`${side}FootZ`] = local.z;
  pose[`${side}FootYaw`] = foot.yaw - pose.yaw;
  pose[`${side}FootPitch`] = foot.pitch;
}

// A hand target given in the root frame (on the floor, or on an opponent), written into the pose's chest frame.
export function placeHandFromRoot({ pose, side, x, y, z }: { pose: Pose; side: Side; x: number; y: number; z: number }): void {
  chestFrame(pose, frame);
  point.set(x, y, z).sub(frame.position).applyQuaternion(inverse.copy(frame.rotation).invert());
  pose[`${side}HandX`] = point.x;
  pose[`${side}HandY`] = point.y;
  pose[`${side}HandZ`] = point.z;
}

// A foot target given in the pelvis frame (a tuck, a kick), written into the pose's root frame.
export function placeFootFromPelvis({ pose, side, x, y, z, amount = 1 }: { pose: Pose; side: Side; x: number; y: number; z: number; amount?: number }): void {
  pelvisFrame(pose, frame);
  point.set(x, y, z).applyQuaternion(frame.rotation).add(frame.position);
  pose[`${side}FootX`] += (point.x - pose[`${side}FootX`]) * amount;
  pose[`${side}FootY`] += (point.y - pose[`${side}FootY`]) * amount;
  pose[`${side}FootZ`] += (point.z - pose[`${side}FootZ`]) * amount;
}
