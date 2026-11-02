import { clamp, curve, ease, lerp, rateOf, sloped } from '../motion/curves';
import { bakeGait, RUN, RUNNING, sampleFoot, WALK, WALKING, offsetFrom, type FootSample, type RootSample } from '../motion/footwork';
import { placeFoot, placeHandFromRoot, placeRoot } from '../motion/placement';
import { blendPose, sign, SIDES, standingPose, type Pose } from '../motion/pose';
import type { Clip } from './types';

const HALF_TURN = Math.PI / 2;
// The slide turns side-on to the run, a little toward the camera's left, so the tails whip past the head in view.
const SLIDE_FACING = -0.45;

// Out to the right, a cut turn, a sprint back to the left and a sliding stop, then a walk back to the centre.
const rootX = sloped([
  [0, 0, 0],
  [0.42, 0, 0],
  [1.0, 0.7, 2.5],
  [1.42, 1.5, 1.5],
  [1.68, 1.7, 0],
  [2.2, 1.12, -2.3],
  [2.62, -0.05, -3.4],
  [2.88, -1.0, -3.8],
  [3.2, -1.6, 0],
  [5.25, -1.6, 0],
  [5.7, -1.33, 1.2],
  [6.35, -0.38, 1.25],
  [6.95, 0, 0],
]);
const rootYaw = curve([
  [0, 0],
  [0.2, 0],
  [0.6, HALF_TURN],
  [1.48, HALF_TURN],
  [1.92, -HALF_TURN],
  [2.9, -HALF_TURN],
  [3.05, SLIDE_FACING],
  [5.2, SLIDE_FACING],
  [5.5, HALF_TURN],
  [6.45, HALF_TURN],
  [6.95, 0],
]);
const speedAt = (time: number): number => Math.abs(rateOf({ curve: rootX, time }));
const rootAt = (time: number, out: RootSample): RootSample => {
  out.x = rootX(time);
  out.z = 0;
  out.yaw = rootYaw(time);
  return out;
};

const SLIDE_START = 2.86;
const WALK_START = 5.28;
const DURATION = 7.6;
const stance = standingPose();
const sprintGait = bakeGait({
  root: rootAt,
  speed: speedAt,
  start: 0.42,
  end: 2.92,
  initial: { l: { x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw }, r: { x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw } },
  first: 'r',
  style: RUNNING,
});

// The slide: side-on to the run, right foot leading toward the stop, left trailing, both carried by the root.
const SLIDE_FEET = { r: { x: -0.44, z: 0.07, yaw: -0.85 }, l: { x: 0.34, z: -0.05, yaw: 0.3 } } as const;
const slideRoot: RootSample = { x: rootX(WALK_START), z: 0, yaw: rootYaw(WALK_START) };
const walkGait = bakeGait({
  root: rootAt,
  speed: speedAt,
  start: WALK_START,
  end: 6.9,
  initial: { l: worldFoot(SLIDE_FEET.l), r: worldFoot(SLIDE_FEET.r) },
  first: 'r',
  style: WALKING,
});

function worldFoot(foot: { x: number; z: number; yaw: number }): RootSample {
  return { ...offsetFrom({ root: slideRoot, x: foot.x, z: foot.z }), yaw: slideRoot.yaw + foot.yaw };
}

const slideLow = curve([
  [SLIDE_START, 0.8],
  [3.08, 0.56],
  [3.4, 0.53],
  [4.5, 0.58],
  [5.2, 0.9],
]);
const slideLean = curve([
  [SLIDE_START, 0],
  [3.05, 1],
  [3.6, 0.85],
  [4.4, 0.7],
  [5.2, 0],
]);
const handDown = curve([
  [2.95, 0],
  [3.12, 1],
  [4.3, 1],
  [4.75, 0],
]);
const lookBack = curve([
  [3.0, 0],
  [3.25, 1],
  [4.5, 1],
  [5.15, -0.6],
]);
const pivotDip = curve([
  [1.45, 0],
  [1.7, 1],
  [2.0, 0],
]);

const scratch = { root: { x: 0, z: 0, yaw: 0 }, foot: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } satisfies FootSample };
const layers = { slide: standingPose(), walk: standingPose() };

function runLayer(time: number, pose: Pose): void {
  const root = rootAt(time, scratch.root);
  placeRoot({ pose, root });
  const speed = speedAt(time),
    effort = clamp(speed / 3.5, 0, 1);
  const acceleration = (speedAt(time + 0.02) - speedAt(time - 0.02)) / 0.04;
  for (const side of SIDES) placeFoot({ pose, side, foot: sampleFoot({ plants: sprintGait.plants[side], time, style: RUN, out: scratch.foot }) });
  const bounce = sprintGait.compression(time) * effort;
  const anticipation = ease(time, 0.05, 0.4) - ease(time, 0.42, 0.7);
  pose.pelvisY = lerp(0.93, 0.85, effort) - 0.035 * bounce - 0.06 * anticipation - 0.11 * pivotDip(time);
  pose.pelvisX = 0;
  pose.pelvisZ = 0.04 * effort;
  const lean = 0.08 + 0.13 * effort + clamp(acceleration / 7, -0.18, 0.22) + 0.12 * anticipation;
  pose.pelvisPitch = lean * 0.6;
  pose.spinePitch = lean * 0.35;
  pose.chestPitch = lean * 0.25;
  pose.headPitch = -lean * 0.9;
  const swing = sprintGait.forward('l', time) * effort;
  pose.pelvisYaw = -0.14 * swing;
  pose.pelvisRoll = 0;
  pose.spineYaw = 0.1 * swing;
  pose.chestYaw = 0.16 * swing;
  pose.chestRoll = 0;
  pose.headYaw = 0;
  pose.headRoll = 0;
  for (const side of SIDES) {
    const s = sign(side),
      arm = (1 - sprintGait.forward(side, time)) / 2;
    const reach = effort;
    pose[`${side}HandX`] = lerp(stance[`${side}HandX`], s * lerp(0.21, 0.1, arm), reach);
    pose[`${side}HandY`] = lerp(stance[`${side}HandY`], lerp(-0.22, 0.07, arm), reach);
    pose[`${side}HandZ`] = lerp(stance[`${side}HandZ`], lerp(-0.2, 0.28, arm), reach);
    pose[`${side}Elbow`] = 0.1;
    pose[`${side}Knee`] = 0.1;
  }
}

function slideLayer(time: number, pose: Pose): void {
  const root = rootAt(time, scratch.root);
  placeRoot({ pose, root });
  const lean = slideLean(time);
  for (const side of SIDES) {
    const foot = SLIDE_FEET[side];
    pose[`${side}FootX`] = foot.x;
    pose[`${side}FootY`] = 0.08;
    pose[`${side}FootZ`] = foot.z;
    pose[`${side}FootYaw`] = foot.yaw;
    pose[`${side}FootPitch`] = side === 'r' ? -0.2 * lean : 0;
    pose[`${side}Knee`] = side === 'r' ? 0.5 : 0.25;
  }
  pose.pelvisY = slideLow(time);
  pose.pelvisX = 0.1 * lean;
  pose.pelvisZ = -0.03;
  pose.pelvisPitch = 0.32 * lean;
  pose.pelvisYaw = -0.12 * lean;
  pose.pelvisRoll = -0.4 * lean;
  pose.spinePitch = 0.18 * lean;
  pose.spineYaw = -0.05 * lean;
  pose.spineRoll = 0.12 * lean;
  pose.chestPitch = 0.12 * lean;
  pose.chestYaw = -0.08 * lean;
  pose.chestRoll = 0.14 * lean;
  const look = lookBack(time);
  pose.headYaw = -0.55 * look;
  pose.headPitch = -0.35 * lean;
  pose.headRoll = 0.1 * look;
  // The trailing hand reaches down beside the left foot, on the side the body leans to; the leading arm opens toward
  // the stop for balance.
  const down = handDown(time);
  pose.rHandX = lerp(-0.25, -0.6, down);
  pose.rHandY = lerp(-0.32, 0.12, down);
  pose.rHandZ = lerp(0.05, 0.2, down);
  pose.rElbow = 0.3 * down;
  placeHandFromRoot({ pose, side: 'l', x: 0.5, y: 0.28, z: 0.04 });
  pose.lHandX = lerp(0.25, pose.lHandX, down);
  pose.lHandY = lerp(-0.32, pose.lHandY, down);
  pose.lHandZ = lerp(0.05, pose.lHandZ, down);
  pose.lElbow = 0;
}

function walkLayer(time: number, pose: Pose): void {
  const root = rootAt(time, scratch.root);
  placeRoot({ pose, root });
  for (const side of SIDES) placeFoot({ pose, side, foot: sampleFoot({ plants: walkGait.plants[side], time, style: WALK, out: scratch.foot }) });
  const effort = clamp(speedAt(time) / 1.2, 0, 1);
  pose.pelvisY = 0.92 - 0.015 * walkGait.compression(time) * effort;
  pose.pelvisX = 0;
  pose.pelvisZ = 0;
  pose.pelvisPitch = 0.03 * effort;
  pose.pelvisRoll = 0;
  const swing = walkGait.forward('l', time) * effort;
  pose.pelvisYaw = -0.08 * swing;
  pose.spinePitch = 0.02;
  pose.spineYaw = 0.05 * swing;
  pose.spineRoll = 0;
  pose.chestPitch = 0;
  pose.chestYaw = 0.08 * swing;
  pose.chestRoll = 0;
  pose.headPitch = 0;
  pose.headYaw = 0;
  pose.headRoll = 0;
  for (const side of SIDES) {
    const arm = (1 - walkGait.forward(side, time) * effort) / 2;
    pose[`${side}HandX`] = sign(side) * 0.24;
    pose[`${side}HandY`] = -0.31;
    pose[`${side}HandZ`] = lerp(-0.1, 0.16, arm);
    pose[`${side}Elbow`] = 0;
    pose[`${side}Knee`] = 0.12;
  }
}

export const SPRINT: Clip = {
  id: 'sprint',
  title: 'Sprint and stop',
  summary: 'A sprint, a cut turn and a sliding stop: the tails whip forward and settle.',
  duration: DURATION,
  bounds: { min: [-2.25, 0, -0.8], max: [2.05, 1.8, 0.75] },
  evaluate: ({ time, lead }) => {
    runLayer(time, lead);
    if (time > SLIDE_START) {
      slideLayer(time, layers.slide);
      blendPose({ from: lead, to: layers.slide, amount: ease(time, SLIDE_START, 3.02), out: lead });
    }
    if (time > WALK_START - 0.1) {
      walkLayer(time, layers.walk);
      blendPose({ from: lead, to: layers.walk, amount: ease(time, WALK_START - 0.1, WALK_START + 0.1), out: lead });
    }
    if (time > 6.9) blendPose({ from: lead, to: stance, amount: ease(time, 6.9, 7.3), out: lead });
  },
  partnerOnStage: () => false,
};
