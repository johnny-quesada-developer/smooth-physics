import { clamp, curve, ease, lerp, lerpAngle, sloped, type Curve, type Key } from '../motion/curves';
import { pelvisHeight, takeOff, touchDown, type Flight } from '../motion/flight';
import { RUN, sampleFoot, type FootSample, type Plant, type RootSample } from '../motion/footwork';
import { placeFoot, placeFootFromPelvis, placeRoot } from '../motion/placement';
import { blendPose, sign, SIDES, standingPose, type Pose, type Side } from '../motion/pose';
import type { Clip } from './types';

const RIGHT_TURN = Math.PI / 2;
const TURN = Math.PI * 2;

// How the legs fold in the air: knees to the chest, straight legs folded at the hips, or a small hop.
type Jump = Flight & { readonly shape: 'tuck' | 'pike' | 'hop' };

// A run-up and a tucked front flip to the right, a hop turn, then a run-up and a piked front flip back to the centre.
const TUCK: Jump = { start: 1.13, end: 1.98, from: 0.98, to: 0.92, shape: 'tuck' };
const HOP: Jump = { start: 2.5, end: 2.78, from: 0.9, to: 0.88, shape: 'hop' };
const PIKE: Jump = { start: 3.68, end: 4.53, from: 0.98, to: 0.92, shape: 'pike' };
const FLIGHTS: readonly Jump[] = [TUCK, HOP, PIKE];

const rootX = sloped([
  [0, 0, 0],
  [0.38, 0, 0],
  [0.88, 0.36, 1.5],
  [1.0, 0.52, 1.2],
  [1.13, 0.65, 0.85],
  [1.98, 1.37, 0.85],
  [2.3, 1.5, 0],
  [2.78, 1.5, 0],
  [3.18, 1.25, -1.25],
  [3.42, 0.95, -1.1],
  [3.68, 0.72, -0.87],
  [4.53, -0.02, -0.87],
  [4.85, -0.15, 0],
  [5.35, -0.15, 0],
  [5.85, 0, 0],
]);
const rootYaw = curve([
  [0, 0],
  [0.12, 0],
  [0.45, RIGHT_TURN],
  [2.5, RIGHT_TURN],
  [2.78, -RIGHT_TURN],
  [5.3, -RIGHT_TURN],
  [5.85, 0],
]);

const pelvisGround = sloped([
  [0, 0.93, 0],
  [0.35, 0.93, 0],
  [0.55, 0.88, 0],
  [0.95, 0.85, 0],
  [1.06, 0.74, 0],
  takeOff(TUCK),
  touchDown(TUCK),
  [2.1, 0.66, 0],
  [2.3, 0.7, 0],
  [2.45, 0.8, 0],
  takeOff(HOP),
  touchDown(HOP),
  [2.88, 0.8, 0],
  [3.05, 0.88, 0],
  [3.46, 0.85, 0],
  [3.6, 0.74, 0],
  takeOff(PIKE),
  touchDown(PIKE),
  [4.65, 0.64, 0],
  [4.9, 0.68, 0],
  [5.45, 0.92, 0],
  [5.9, 0.93, 0],
]);

const pitch = curve([
  [0, 0],
  [0.4, 0.08],
  [0.85, 0.16],
  [0.98, -0.04],
  [1.06, 0.2],
  [1.13, 0.36],
  [1.3, 1.25],
  [1.55, Math.PI + 0.15],
  [1.8, TURN - 0.65],
  [1.98, TURN - 0.12],
  [2.1, TURN + 0.42],
  [2.42, TURN + 0.1],
  [2.6, TURN],
  [3.05, TURN + 0.1],
  [3.3, TURN + 0.16],
  [3.48, TURN - 0.04],
  [3.6, TURN + 0.22],
  [3.68, TURN + 0.36],
  [3.86, TURN + 1.2],
  [4.1, TURN + Math.PI + 0.1],
  [4.35, 2 * TURN - 0.7],
  [4.53, 2 * TURN - 0.12],
  [4.65, 2 * TURN + 0.42],
  [4.95, 2 * TURN + 0.12],
  [5.5, 2 * TURN],
]);
const fold = curve([
  [1.12, 0],
  [1.3, 1],
  [1.7, 1],
  [1.9, 0],
  [3.67, 0],
  [3.85, 1],
  [4.25, 1],
  [4.45, 0],
]);
const arch = curve([
  [0.98, 0],
  [1.1, 1],
  [1.22, 0],
  [3.54, 0],
  [3.66, 1],
  [3.78, 0],
]);
const sitBack = curve([
  [1.98, 0],
  [2.1, 1],
  [2.5, 0],
  [4.53, 0],
  [4.66, 1],
  [5.2, 0],
]);

type HandKey = readonly [time: number, x: number, y: number, z: number];
const RELAXED = [0.25, -0.32, 0.05] as const;
const BACK = [0.2, -0.26, -0.32] as const;
const UP = [0.16, 0.5, 0.16] as const;
const OPEN = [0.34, 0.02, 0.28] as const;
const FORWARD = [0.22, -0.06, 0.38] as const;
const hands = tracks([
  [0.86, 0.2, -0.1, 0.12],
  [1.04, ...BACK],
  [1.13, ...UP],
  [1.3, 0.13, -0.2, 0.34],
  [1.72, 0.13, -0.2, 0.34],
  [1.9, ...OPEN],
  [2.1, ...FORWARD],
  [2.45, ...RELAXED],
  [2.52, 0.34, -0.18, 0.1],
  [2.85, ...RELAXED],
  [3.36, 0.2, -0.1, 0.12],
  [3.58, ...BACK],
  [3.68, ...UP],
  [3.86, 0.12, -0.36, 0.44],
  [4.25, 0.12, -0.36, 0.44],
  [4.42, ...OPEN],
  [4.65, ...FORWARD],
  [5.25, ...RELAXED],
]);
// Arm drive on the run-ups, timed to the steps: 1 with the left arm forward, -1 with the right.
const pumping = (time: number): number => (time < 2 ? Math.cos((Math.PI * (time - 0.62)) / 0.18) : -Math.cos((Math.PI * (time - 3.18)) / 0.22));
const running = (time: number): number => ease(time, 0.38, 0.55) - ease(time, 0.86, 0.95) + ease(time, 2.95, 3.1) - ease(time, 3.38, 3.48);
const flipArms = (time: number): number => ease(time, 0.86, 0.96) - ease(time, 2.85, 3.0) + ease(time, 3.36, 3.48) - ease(time, 5.1, 5.3);

const stance = standingPose();
const step = ({ time, x, z, yaw, swing, lift = 0.1 }: { time: number; x: number; z: number; yaw: number; swing: number; lift?: number }): Plant => ({
  time,
  x,
  z,
  yaw,
  swing,
  lift,
});
const PLANTS: Readonly<Record<Side, readonly Plant[]>> = {
  l: [
    step({ time: -10, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw, swing: 0 }),
    step({ time: 0.8, x: 0.38, z: -0.1, yaw: RIGHT_TURN + 0.08, swing: 0.2, lift: 0.13 }),
    step({ time: 0.99, x: 0.6, z: -0.11, yaw: RIGHT_TURN + 0.04, swing: 0.11, lift: 0.06 }),
    step({ time: 1.98, x: 1.43, z: -0.13, yaw: RIGHT_TURN + 0.1, swing: 0.85 }),
    step({ time: 2.78, x: 1.5, z: 0.12, yaw: -RIGHT_TURN + 0.1, swing: 0.28 }),
    step({ time: 3.18, x: 1.2, z: 0.1, yaw: -RIGHT_TURN + 0.06, swing: 0.2, lift: 0.13 }),
    step({ time: 3.42, x: 0.88, z: 0.11, yaw: -RIGHT_TURN + 0.04, swing: 0.11, lift: 0.06 }),
    step({ time: 4.53, x: -0.08, z: 0.13, yaw: -RIGHT_TURN + 0.1, swing: 0.95 }),
    step({ time: 5.85, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw, swing: 0.3, lift: 0.08 }),
  ],
  r: [
    step({ time: -10, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw, swing: 0 }),
    step({ time: 0.62, x: 0.2, z: 0.1, yaw: RIGHT_TURN - 0.08, swing: 0.2, lift: 0.12 }),
    step({ time: 0.97, x: 0.62, z: 0.11, yaw: RIGHT_TURN - 0.04, swing: 0.17, lift: 0.1 }),
    step({ time: 1.98, x: 1.43, z: 0.13, yaw: RIGHT_TURN - 0.1, swing: 0.85 }),
    step({ time: 2.78, x: 1.5, z: -0.12, yaw: -RIGHT_TURN - 0.1, swing: 0.28 }),
    step({ time: 3.4, x: 0.9, z: -0.11, yaw: -RIGHT_TURN - 0.04, swing: 0.2, lift: 0.1 }),
    step({ time: 4.53, x: -0.08, z: -0.13, yaw: -RIGHT_TURN - 0.1, swing: 0.95 }),
    step({ time: 5.6, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw, swing: 0.25, lift: 0.08 }),
  ],
};

const scratch = { root: { x: 0, z: 0, yaw: 0 } satisfies RootSample, foot: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } satisfies FootSample };

function flightAt(time: number): Jump | null {
  return FLIGHTS.find((flight) => time >= flight.start - 0.04 && time <= flight.end) ?? null;
}

function evaluate(time: number, pose: Pose): void {
  const root = scratch.root;
  root.x = rootX(time);
  root.z = 0;
  root.yaw = rootYaw(time);
  placeRoot({ pose, root });

  pose.pelvisY = pelvisHeight({ flights: FLIGHTS, ground: pelvisGround, time });
  const back = sitBack(time);
  pose.pelvisX = 0;
  pose.pelvisZ = -0.08 * back;
  const bodyPitch = pitch(time),
    folded = fold(time),
    arched = arch(time),
    lean = Math.sin(bodyPitch) * 0.6;
  pose.pelvisPitch = bodyPitch;
  pose.pelvisYaw = 0;
  pose.pelvisRoll = 0;
  pose.spinePitch = 0.42 * folded + 0.25 * lean - 0.12 * arched;
  pose.spineYaw = 0;
  pose.spineRoll = 0;
  pose.chestPitch = 0.3 * folded + 0.15 * lean - 0.2 * arched;
  pose.chestYaw = 0;
  pose.chestRoll = 0;
  pose.headPitch = 0.3 * folded - 0.9 * lean - 0.3 * arched;
  pose.headYaw = 0;
  pose.headRoll = 0;

  const pump = pumping(time),
    run = running(time),
    flipping = clamp(flipArms(time), 0, 1);
  for (const side of SIDES) {
    const s = sign(side),
      arm = (1 + pump * s) / 2;
    const groundX = lerp(stance[`${side}HandX`], s * lerp(0.21, 0.1, arm), run),
      groundY = lerp(stance[`${side}HandY`], lerp(-0.22, 0.06, arm), run),
      groundZ = lerp(stance[`${side}HandZ`], lerp(-0.18, 0.26, arm), run);
    pose[`${side}HandX`] = lerp(groundX, s * hands.x(time), flipping);
    pose[`${side}HandY`] = lerp(groundY, hands.y(time), flipping);
    pose[`${side}HandZ`] = lerp(groundZ, hands.z(time), flipping);
    pose[`${side}Elbow`] = 0.15 * flipping;
    pose[`${side}Knee`] = 0.12;
    placeFoot({ pose, side, foot: sampleFoot({ plants: PLANTS[side], time, style: RUN, out: scratch.foot }) });
    placeAirFoot({ pose, side, time, folded });
  }
}

// In the air the feet follow the body: under the hips at take-off, folded in the flip, reaching down to land.
function placeAirFoot({ pose, side, time, folded }: { pose: Pose; side: Side; time: number; folded: number }): void {
  const flight = flightAt(time);
  if (!flight) return;
  const s = sign(side);
  const weight = ease(time, flight.start - 0.04, flight.start + 0.05) * (1 - ease(time, flight.end - 0.09, flight.end));
  const reach = ease(time, (flight.start + flight.end) / 2, flight.end - 0.05);
  const hop = flight.shape === 'hop';
  const extendedY = hop ? -0.78 : lerp(-0.9, -0.84, reach),
    extendedZ = hop ? 0.04 : lerp(0.02, 0.08, reach);
  const shapeY = flight.shape === 'pike' ? -0.3 : -0.12,
    shapeZ = flight.shape === 'pike' ? 0.76 : 0.2;
  placeFootFromPelvis({
    pose,
    side,
    x: s * (hop ? 0.12 : 0.11),
    y: lerp(extendedY, shapeY, folded),
    z: lerp(extendedZ, shapeZ, folded),
    amount: weight,
  });
  // Toes point along the shins in the air and come back flat for the landing.
  const pointed = pose.pelvisPitch + (flight.shape === 'pike' ? lerp(1.2, 0.35, folded) : 1.25) * (hop ? 0.4 : 1) * (1 - reach * 0.8);
  pose[`${side}FootPitch`] = lerpAngle(pose[`${side}FootPitch`], pointed, weight);
}

function tracks(keys: readonly HandKey[]): { x: Curve; y: Curve; z: Curve } {
  const component = (index: 1 | 2 | 3): Curve => curve(keys.map((key): Key => [key[0], key[index]]));
  return { x: component(1), y: component(2), z: component(3) };
}

export const FLIP: Clip = {
  id: 'flip',
  title: 'Leap and flip',
  summary: 'A tucked flip, a hop turn and a piked flip: the tails trail the rotation and snap down on landing.',
  duration: 6.6,
  bounds: { min: [-1, -0.05, -0.7], max: [2.35, 2.8, 0.6] },
  evaluate: ({ time, lead }) => {
    evaluate(time, lead);
    if (time > 5.85) blendPose({ from: lead, to: stance, amount: ease(time, 5.85, 6.2), out: lead });
  },
  partnerOnStage: () => false,
};
