import * as THREE from 'three';
import type { ClothSettingsInput } from 'smooth-physics';
import type { ThreeClothSpec, ThreeColliderSpec } from 'smooth-physics/three';
import { createProp, type PropColor } from '@/features/Stage/runtime/props';
import { SIDES, sign, type Pose, type Side } from '../motion/pose';
import { bodyTone, type BodyTone } from './bodyTone';

// Metres. The hip joints sit below the pelvis origin; the arms hang from the chest.
export const BODY = {
  spine: 0.08,
  chest: 0.2,
  neck: 0.22,
  head: 0.08,
  hip: { x: 0.1, y: -0.05 },
  shoulder: { x: 0.19, y: 0.17 },
  thigh: 0.43,
  shin: 0.43,
  upperArm: 0.28,
  forearm: 0.27,
} as const;

const TAIL_LINKS: Readonly<Record<Side, number>> = { l: 12, r: 14 };
const TAIL_STEP = 0.056;
const TAIL_WIDTH = 0.075;
const TAIL_KNOT = 0.028;
const TAIL_FLARE = 4;

const BANDANA: ClothSettingsInput = {
  gravity: 5.5,
  damping: [0.035, 0.02],
  // With the colliders at the size of the body, the tails keep this far off it, which leaves room for a limb that
  // swings through them faster than a step.
  radius: 0.02,
  stiffness: [1, 0.85],
  // Low, so a tail twists and flutters like a strip of fabric and shows its face from any side.
  bendingStiffness: 0.25,
  restoration: { stiffness: [0.16, 0.012], velocityDamping: 0.6 },
  inertia: {
    movementSpeedLimit: 9,
    rotationSpeedLimit: 1440,
    particleSpeedLimit: 9,
    // A fighter moved at once to the start of a chosen clip takes its tails along instead of flinging them.
    teleport: { mode: 'keep', distance: 0.45, rotation: 80 },
  },
  // Edges, not only particles: a limb thinner than a link otherwise slips between two particles and through the strip.
  // Low friction lets a tail slide off a shoulder instead of catching on it.
  collision: { mode: 'edge', friction: 0.05 },
};

type Limb = { readonly upper: THREE.Group; readonly middle: THREE.Group; readonly end: THREE.Group | null };

export type Ninja = {
  readonly name: string;
  readonly root: THREE.Group;
  readonly head: THREE.Group;
  // One cloth per tail, named after the fighter and the side.
  readonly cloths: readonly ThreeClothSpec[];
  readonly colliders: readonly ThreeColliderSpec[];
  apply(pose: Pose): void;
};

// Without a sash colour the belt takes the body's lighter shade.
export function createNinja({ name, sash, tone = 'charcoal' }: { name: string; sash?: PropColor; tone?: BodyTone }): Ninja {
  const materials = bodyTone(tone);
  const part = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.onBeforeRender = materials.refresh;
    return mesh;
  };
  const group = (parent: THREE.Object3D, y = 0, x = 0): THREE.Group => {
    const child = new THREE.Group();
    child.position.set(x, y, 0);
    parent.add(child);
    return child;
  };
  const capsule = ({
    radius,
    length,
    y,
    material = materials.body,
  }: {
    radius: number;
    length: number;
    y: number;
    material?: THREE.MeshStandardMaterial;
  }): THREE.Mesh => {
    const mesh = part(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
    mesh.position.y = y;
    return mesh;
  };

  const root = new THREE.Group();
  root.name = name;
  const pelvis = group(root),
    spine = group(pelvis, BODY.spine),
    chest = group(spine, BODY.chest),
    neck = group(chest, BODY.neck),
    head = group(neck, BODY.head);

  const hips = part(new THREE.CapsuleGeometry(0.11, 0.12, 6, 14), materials.body);
  hips.rotation.z = Math.PI / 2;
  hips.position.y = -0.02;
  pelvis.add(hips);
  spine.add(capsule({ radius: 0.105, length: 0.1, y: 0.07 }));
  const beltShape = new THREE.CylinderGeometry(0.113, 0.118, 0.055, 28, 1, true);
  const belt = sash ? createProp({ geometry: beltShape, color: sash, roughness: 0.75, metalness: 0 }) : part(beltShape, materials.detail);
  belt.position.y = 0.03;
  spine.add(belt);
  const torso = capsule({ radius: 0.14, length: 0.14, y: 0.12 });
  torso.scale.set(1.28, 1, 0.82);
  chest.add(torso);
  neck.add(capsule({ radius: 0.045, length: 0.06, y: 0.05 }));
  const skull = part(new THREE.SphereGeometry(0.115, 28, 20), materials.body);
  skull.position.y = 0.11;
  skull.scale.set(0.94, 1.04, 1);
  head.add(skull);
  head.add(createHeadband());

  const arms = SIDES.map((side) => createArm({ side, chest, part, capsule, materials }));
  const legs = SIDES.map((side) => createLeg({ side, pelvis, part, capsule, materials }));
  const tails = SIDES.map((side) => ({ side, edges: tailOf({ side, head }) }));

  // Sized to the visible body, on every part a tail can reach: all but the feet. A capsule's length runs tip to tip,
  // unlike a three.js capsule's, and a tapered one keeps its radius at the end toward its positive axis: the joint a
  // limb hangs from.
  const colliders: ThreeColliderSpec[] = [
    { object: head, shape: 'sphere', radius: 0.122, center: [0, 0.11, 0] },
    // Two capsules side by side follow the torso, which is wider than it is deep.
    ...SIDES.map((side): ThreeColliderSpec => ({ object: chest, shape: 'capsule', radius: 0.12, length: 0.42, center: [sign(side) * 0.05, 0.12, 0] })),
    { object: spine, shape: 'capsule', radius: 0.112, length: 0.324, center: [0, 0.05, 0] },
    { object: pelvis, shape: 'capsule', radius: 0.11, length: 0.34, axis: 'x', center: [0, -0.02, 0] },
    ...arms.flatMap(({ upper, middle }): ThreeColliderSpec[] => [
      { object: upper, shape: 'capsule', radius: 0.058, endRadius: 0.047, length: 0.385, center: [0, -0.1345, 0] },
      { object: middle, shape: 'capsule', radius: 0.048, length: 0.366, center: [0, -0.135, 0] },
    ]),
    ...legs.flatMap(({ upper, middle }): ThreeColliderSpec[] => [
      { object: upper, shape: 'capsule', radius: 0.08, endRadius: 0.072, length: 0.552, center: [0, -0.196, 0] },
      { object: middle, shape: 'capsule', radius: 0.064, endRadius: 0.058, length: 0.522, center: [0, -0.197, 0] },
    ]),
    // Mostly inside the head and chest, it fills the crease between them, where a tail pulled around the neck would
    // otherwise be pushed both ways and stay caught.
    { object: neck, shape: 'capsule', radius: 0.045, length: 0.15, center: [0, 0.05, 0] },
  ];
  const frames = { pelvis, spine, chest, neck, head, arms, legs };
  return {
    name,
    root,
    head,
    cloths: tails.map(({ side, edges }) => ({ name: tailName({ ninja: name, side }), bones: edges, anchor: head, connection: 'strip', settings: BANDANA })),
    colliders,
    apply: (pose) => applyPose({ root, frames, pose }),
  };
}

function createHeadband(): THREE.Group {
  const band = new THREE.Group();
  const loop = createProp({ geometry: new THREE.CylinderGeometry(0.112, 0.116, 0.042, 36, 1, true), color: 'lime', roughness: 0.75, metalness: 0 });
  loop.position.y = 0.15;
  loop.rotation.x = -0.1;
  const knot = createProp({ geometry: new THREE.SphereGeometry(0.03, 16, 12), color: 'lime', roughness: 0.75, metalness: 0 });
  knot.position.set(0, 0.145, -0.118);
  knot.scale.set(1.3, 0.9, 0.8);
  // The opening of the mask: a strip around the front of the head, which also shows where the fighter looks.
  const eyes = createProp({
    geometry: new THREE.CylinderGeometry(0.117, 0.117, 0.03, 16, 1, true, -0.8, 1.6),
    color: 'stone',
    roughness: 0.5,
    metalness: 0,
  });
  eyes.position.y = 0.102;
  band.add(loop, knot, eyes);
  return band;
}

type Part = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial) => THREE.Mesh;
type CapsuleMaker = (input: { radius: number; length: number; y: number; material?: THREE.MeshStandardMaterial }) => THREE.Mesh;
type Materials = ReturnType<typeof bodyTone>;

function createArm({
  side,
  chest,
  part,
  capsule,
  materials,
}: {
  side: Side;
  chest: THREE.Group;
  part: Part;
  capsule: CapsuleMaker;
  materials: Materials;
}): Limb {
  const upper = new THREE.Group(),
    middle = new THREE.Group();
  upper.position.set(sign(side) * BODY.shoulder.x, BODY.shoulder.y, 0);
  middle.position.y = -BODY.upperArm;
  chest.add(upper);
  upper.add(middle);
  upper.add(part(new THREE.SphereGeometry(0.058, 16, 12), materials.body));
  upper.add(capsule({ radius: 0.05, length: 0.2, y: -0.14 }));
  middle.add(part(new THREE.SphereGeometry(0.047, 14, 10), materials.body));
  middle.add(capsule({ radius: 0.043, length: 0.17, y: -0.12, material: materials.detail }));
  const fist = part(new THREE.SphereGeometry(0.048, 16, 12), materials.detail);
  fist.position.y = -BODY.forearm;
  fist.scale.set(0.9, 1.05, 1);
  middle.add(fist);
  return { upper, middle, end: null };
}

function createLeg({
  side,
  pelvis,
  part,
  capsule,
  materials,
}: {
  side: Side;
  pelvis: THREE.Group;
  part: Part;
  capsule: CapsuleMaker;
  materials: Materials;
}): Limb {
  const upper = new THREE.Group(),
    middle = new THREE.Group(),
    end = new THREE.Group();
  upper.position.set(sign(side) * BODY.hip.x, BODY.hip.y, 0);
  middle.position.y = -BODY.thigh;
  end.position.y = -BODY.shin;
  pelvis.add(upper);
  upper.add(middle);
  middle.add(end);
  upper.add(part(new THREE.SphereGeometry(0.08, 16, 12), materials.body));
  upper.add(capsule({ radius: 0.074, length: 0.33, y: -0.215 }));
  middle.add(part(new THREE.SphereGeometry(0.064, 14, 10), materials.body));
  middle.add(capsule({ radius: 0.058, length: 0.33, y: -0.215, material: materials.detail }));
  const foot = part(new THREE.CapsuleGeometry(0.042, 0.15, 4, 12), materials.detail);
  foot.rotation.x = Math.PI / 2;
  foot.position.set(0, -0.04, 0.055);
  foot.scale.set(1.05, 1, 0.8);
  end.add(foot);
  return { upper, middle, end };
}

export const tailName = ({ ninja, side }: { ninja: string; side: Side }): string => `${ninja}-${side}`;

// A tail is a strip of three bone chains (two edges and a middle: an open strip never joins its first chain to its
// last, so two chains would stay apart), gathered at the knot and opening to its full width over the first links.
// Its width runs mostly front to back, so the face of the strip shows from the side, where the camera mostly sees
// the fighters, and turns toward the back as the tails twist.
function tailOf({ side, head }: { side: Side; head: THREE.Group }): THREE.Bone[] {
  const s = sign(side);
  const across = new THREE.Vector3(s * 0.55, 0.4, -0.75).normalize();
  return [-1, 0, 1].map((edge) => {
    const first = new THREE.Bone();
    first.position.set(s * 0.026, 0.14, -0.142).addScaledVector(across, (edge * TAIL_KNOT) / 2);
    head.add(first);
    let previous = first;
    for (let link = 1; link < TAIL_LINKS[side]; link++) {
      const next = new THREE.Bone();
      // Down and back, the two tails parting a little.
      next.position.set(s * 0.005, -TAIL_STEP * 0.88, -TAIL_STEP * 0.47);
      if (link <= TAIL_FLARE) next.position.addScaledVector(across, (edge * (TAIL_WIDTH - TAIL_KNOT)) / 2 / TAIL_FLARE);
      previous.add(next);
      previous = next;
    }
    return first;
  });
}

type Frames = {
  readonly pelvis: THREE.Group;
  readonly spine: THREE.Group;
  readonly chest: THREE.Group;
  readonly neck: THREE.Group;
  readonly head: THREE.Group;
  readonly arms: readonly Limb[];
  readonly legs: readonly Limb[];
};

const DOWN = new THREE.Vector3(0, -1, 0);
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const scratch = {
  pelvisQ: new THREE.Quaternion(),
  spineQ: new THREE.Quaternion(),
  chestQ: new THREE.Quaternion(),
  spineP: new THREE.Vector3(),
  chestP: new THREE.Vector3(),
  local: new THREE.Quaternion(),
  start: new THREE.Vector3(),
  target: new THREE.Vector3(),
  pole: new THREE.Vector3(),
  joint: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  upperQ: new THREE.Quaternion(),
  lowerQ: new THREE.Quaternion(),
  footQ: new THREE.Quaternion(),
  inverse: new THREE.Quaternion(),
  offset: new THREE.Vector3(),
};

// The pelvis and chest of a pose in its root frame, for placing targets relative to the body.
export type BodyFrame = { readonly position: THREE.Vector3; readonly rotation: THREE.Quaternion };

export function pelvisFrame(pose: Pose, out: BodyFrame): BodyFrame {
  out.position.set(pose.pelvisX, pose.pelvisY, pose.pelvisZ);
  out.rotation.setFromEuler(euler.set(pose.pelvisPitch, pose.pelvisYaw, pose.pelvisRoll, 'YXZ'));
  return out;
}

export function chestFrame(pose: Pose, out: BodyFrame): BodyFrame {
  pelvisFrame(pose, out);
  out.position.add(scratch.offset.set(0, BODY.spine, 0).applyQuaternion(out.rotation));
  out.rotation.multiply(scratch.local.setFromEuler(euler.set(pose.spinePitch, pose.spineYaw, pose.spineRoll, 'YXZ')));
  out.position.add(scratch.offset.set(0, BODY.chest, 0).applyQuaternion(out.rotation));
  out.rotation.multiply(scratch.local.setFromEuler(euler.set(pose.chestPitch, pose.chestYaw, pose.chestRoll, 'YXZ')));
  return out;
}

function applyPose({ root, frames, pose }: { root: THREE.Group; frames: Frames; pose: Pose }): void {
  const { pelvisQ, spineQ, chestQ, spineP, chestP } = scratch;
  root.position.set(pose.x, 0, pose.z);
  root.rotation.set(0, pose.yaw, 0);

  frames.pelvis.position.set(pose.pelvisX, pose.pelvisY, pose.pelvisZ);
  frames.pelvis.quaternion.setFromEuler(euler.set(pose.pelvisPitch, pose.pelvisYaw, pose.pelvisRoll, 'YXZ'));
  frames.spine.quaternion.setFromEuler(euler.set(pose.spinePitch, pose.spineYaw, pose.spineRoll, 'YXZ'));
  frames.chest.quaternion.setFromEuler(euler.set(pose.chestPitch, pose.chestYaw, pose.chestRoll, 'YXZ'));
  // The neck takes part of the head's turn, so a look over the shoulder bends the whole neck.
  frames.neck.quaternion.setFromEuler(euler.set(pose.headPitch * 0.4, pose.headYaw * 0.45, pose.headRoll * 0.4, 'YXZ'));
  frames.head.quaternion.setFromEuler(euler.set(pose.headPitch * 0.6, pose.headYaw * 0.55, pose.headRoll * 0.6, 'YXZ'));

  pelvisQ.copy(frames.pelvis.quaternion);
  spineQ.copy(pelvisQ).multiply(frames.spine.quaternion);
  chestQ.copy(spineQ).multiply(frames.chest.quaternion);
  spineP.set(0, BODY.spine, 0).applyQuaternion(pelvisQ).add(frames.pelvis.position);
  chestP.set(0, BODY.chest, 0).applyQuaternion(spineQ).add(spineP);

  SIDES.forEach((side, index) => {
    const leg = frames.legs[index],
      arm = frames.arms[index];
    if (leg) placeLeg({ leg, side, pose });
    if (arm) placeArm({ arm, side, pose });
  });
}

function placeLeg({ leg, side, pose }: { leg: Limb; side: Side; pose: Pose }): void {
  const { pelvisQ, start, target, pole, joint, direction, upperQ, lowerQ, footQ, inverse, local } = scratch;
  const s = sign(side);
  start
    .set(s * BODY.hip.x, BODY.hip.y, 0)
    .applyQuaternion(pelvisQ)
    .add(scratch.offset.set(pose.pelvisX, pose.pelvisY, pose.pelvisZ));
  target.set(pose[`${side}FootX`], pose[`${side}FootY`], pose[`${side}FootZ`]);
  // Knees point where the pelvis and the foot point, opened a little to the side.
  footQ.setFromEuler(euler.set(pose[`${side}FootPitch`], pose[`${side}FootYaw`], 0, 'YXZ'));
  pole
    .set(s * pose[`${side}Knee`], 0, 1)
    .applyQuaternion(pelvisQ)
    .add(direction.set(0, 0, 1).applyQuaternion(footQ).multiplyScalar(0.6));
  solveTwoBone({ start, target, pole, upper: BODY.thigh, lower: BODY.shin, joint });

  upperQ.setFromUnitVectors(DOWN, direction.subVectors(joint, start).normalize());
  leg.upper.quaternion.copy(inverse.copy(pelvisQ).invert().multiply(upperQ));
  lowerQ.setFromUnitVectors(DOWN, direction.subVectors(target, joint).normalize());
  leg.middle.quaternion.copy(local.copy(upperQ).invert().multiply(lowerQ));
  leg.end?.quaternion.copy(inverse.copy(lowerQ).invert().multiply(footQ));
}

function placeArm({ arm, side, pose }: { arm: Limb; side: Side; pose: Pose }): void {
  const { chestQ, chestP, start, target, pole, joint, direction, upperQ, lowerQ, inverse, local } = scratch;
  const s = sign(side),
    raise = pose[`${side}Elbow`];
  start
    .set(s * BODY.shoulder.x, BODY.shoulder.y, 0)
    .applyQuaternion(chestQ)
    .add(chestP);
  target.set(pose[`${side}HandX`], pose[`${side}HandY`], pose[`${side}HandZ`]).applyQuaternion(chestQ).add(chestP);
  // Elbows hang down and back; raising them swings them out to the side, as in a hook or a guard.
  pole
    .set(s * (0.22 + raise * 0.8), -0.45 + raise * 0.8, -0.85 + raise * 0.5)
    .normalize()
    .applyQuaternion(chestQ);
  solveTwoBone({ start, target, pole, upper: BODY.upperArm, lower: BODY.forearm, joint });

  upperQ.setFromUnitVectors(DOWN, direction.subVectors(joint, start).normalize());
  arm.upper.quaternion.copy(inverse.copy(chestQ).invert().multiply(upperQ));
  lowerQ.setFromUnitVectors(DOWN, direction.subVectors(target, joint).normalize());
  arm.middle.quaternion.copy(local.copy(upperQ).invert().multiply(lowerQ));
}

const perpendicular = new THREE.Vector3();
const reach = new THREE.Vector3();

// Places the middle joint for a limb from start to target, bending toward the pole. A target out of reach is
// pulled in along the same line, so the limb straightens toward it. The target is updated to the reached point.
function solveTwoBone({
  start,
  target,
  pole,
  upper,
  lower,
  joint,
}: {
  start: THREE.Vector3;
  target: THREE.Vector3;
  pole: THREE.Vector3;
  upper: number;
  lower: number;
  joint: THREE.Vector3;
}): void {
  reach.subVectors(target, start);
  const length = reach.length();
  if (length < 1e-6) reach.copy(DOWN);
  reach.normalize();
  const distance = Math.min(Math.max(length, Math.abs(upper - lower) + 1e-3), upper + lower - 1e-4);
  target.copy(start).addScaledVector(reach, distance);
  const cosine = (upper * upper + distance * distance - lower * lower) / (2 * upper * distance);
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  perpendicular.copy(pole).addScaledVector(reach, -pole.dot(reach));
  if (perpendicular.lengthSq() < 1e-8) perpendicular.set(0, 0, 1).addScaledVector(reach, -reach.z);
  perpendicular.normalize();
  joint
    .copy(start)
    .addScaledVector(reach, upper * cosine)
    .addScaledVector(perpendicular, upper * sine);
}
