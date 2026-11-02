import { curve, ease, lerp, lerpAngle, sloped, type Curve, type Key } from '../motion/curves';
import { perform, type AirMove, type Choreography } from '../motion/choreography';
import { takeOff, touchDown, type Flight } from '../motion/flight';
import type { Plant } from '../motion/footwork';
import { placeHandFromRoot } from '../motion/placement';
import { blendPose, sign, SIDES, standingPose, type Pose, type Side } from '../motion/pose';
import type { Clip } from './types';

// The lead fights facing +X from the left, the partner facing -X from the right. Both stand orthodox: left foot and
// left shoulder forward.
const RIGHT_TURN = Math.PI / 2;
const TURN = Math.PI * 2;
const FRONT_TOE = -0.15;
const REAR_TOE = -0.6;
const DURATION = 8.4;

const GUARD_LEFT = [0.1, 0.27, 0.27] as const;
const GUARD_RIGHT = [-0.11, 0.24, 0.16] as const;
const SIDE_LEFT = [0.24, -0.33, 0.03] as const;
const SIDE_RIGHT = [-0.24, -0.33, 0.03] as const;

const keys = (values: readonly Key[]): Curve => curve(values);
const plant = ({ time, x, z, yaw, swing = 0, lift = 0 }: { time: number; x: number; z: number; yaw: number; swing?: number; lift?: number }): Plant => ({
  time,
  x,
  z,
  yaw,
  swing,
  lift,
});

const stance = standingPose();
const guard = standingPose();
guard.pelvisY = 0.86;
guard.pelvisPitch = 0.08;
for (const side of SIDES) guard[`${side}Knee`] = 0.2;

// Lead: steps back into guard, jab and cross, ducks the spinning kick, sweeps, blocks and uppercuts, bows, walks home.
const LEAD_FACING = RIGHT_TURN;
const LEAD_SWEPT = RIGHT_TURN - TURN;
const lead: Choreography = {
  x: keys([
    [0, 0],
    [0.3, 0],
    [0.8, -0.6],
    [1.75, -0.6],
    [1.95, -0.38],
    [2.2, -0.28],
    [2.5, -0.55],
    [3.66, -0.55],
    [3.8, -0.2],
    [4.45, -0.2],
    [4.65, -0.48],
    [4.92, -0.48],
    [5.25, -0.4],
    [5.5, -0.48],
    [5.75, -0.8],
    [6.05, -0.7],
    [6.95, -0.68],
    [7.6, -0.18],
    [8.0, 0],
  ]),
  yaw: keys([
    [0, 0],
    [0.15, 0],
    [0.6, LEAD_FACING],
    [3.85, LEAD_FACING],
    [4.4, LEAD_SWEPT],
    [6.95, LEAD_SWEPT],
    [7.6, -TURN],
  ]),
  height: keys([
    [0, 0.93],
    [0.3, 0.93],
    [0.7, 0.86],
    [1.9, 0.84],
    [2.2, 0.82],
    [2.5, 0.86],
    [2.84, 0.86],
    [2.98, 0.6],
    [3.28, 0.58],
    [3.52, 0.84],
    [3.74, 0.72],
    [3.86, 0.5],
    [4.32, 0.5],
    [4.55, 0.82],
    [4.95, 0.84],
    [5.15, 0.78],
    [5.28, 0.86],
    [5.5, 0.84],
    [5.6, 0.8],
    [5.68, 0.95],
    [5.82, 0.82],
    [6.05, 0.9],
    [6.2, 0.93],
    [7.9, 0.93],
  ]),
  flights: [],
  body: {
    pelvisPitch: keys([
      [0, 0],
      [0.7, 0.08],
      [1.95, 0.14],
      [2.2, 0.16],
      [2.5, 0.08],
      [2.84, 0.08],
      [2.98, 0.5],
      [3.28, 0.5],
      [3.52, 0.1],
      [3.86, 0.55],
      [4.32, 0.55],
      [4.55, 0.1],
      [5.25, 0.12],
      [5.5, 0.08],
      [6.05, 0.03],
      [6.2, 0.12],
      [6.5, 0.12],
      [6.7, 0.02],
      [7.9, 0],
    ]),
    pelvisYaw: keys([
      [0, 0],
      [0.7, -0.35],
      [1.95, -0.45],
      [2.2, 0.15],
      [2.5, -0.35],
      [3.7, -0.35],
      [3.85, 0],
      [4.45, 0],
      [4.62, -0.35],
      [5.1, -0.35],
      [5.28, 0.1],
      [5.5, -0.35],
      [5.95, -0.35],
      [6.1, 0],
    ]),
    chestYaw: keys([
      [0, 0],
      [0.7, -0.15],
      [1.95, -0.25],
      [2.2, 0.35],
      [2.5, -0.15],
      [3.7, -0.15],
      [3.85, 0],
      [4.45, 0],
      [4.62, -0.15],
      [5.1, -0.15],
      [5.28, 0.25],
      [5.5, -0.15],
      [5.95, -0.15],
      [6.1, 0],
    ]),
    headYaw: keys([
      [0, 0],
      [0.7, 0.45],
      [1.95, 0.6],
      [2.2, -0.45],
      [2.5, 0.45],
      [3.7, 0.45],
      [3.85, 0],
      [4.45, 0],
      [4.62, 0.45],
      [5.1, 0.45],
      [5.28, -0.3],
      [5.5, 0.45],
      [5.95, 0.45],
      [6.1, 0],
    ]),
    spinePitch: keys([
      [0, 0],
      [2.84, 0],
      [2.98, 0.25],
      [3.28, 0.25],
      [3.52, 0],
      [3.86, 0.2],
      [4.32, 0.2],
      [4.55, 0],
      [6.05, 0],
      [6.2, 0.2],
      [6.5, 0.2],
      [6.7, 0],
    ]),
    chestPitch: keys([
      [6.05, 0],
      [6.2, 0.15],
      [6.5, 0.15],
      [6.7, 0],
    ]),
    headPitch: keys([
      [0, 0],
      [2.84, 0],
      [2.98, -0.35],
      [3.28, -0.35],
      [3.52, 0],
      [3.86, -0.2],
      [4.32, -0.2],
      [4.55, 0],
      [6.05, 0],
      [6.2, 0.3],
      [6.5, 0.3],
      [6.7, 0],
    ]),
  },
  hands: {
    l: [
      [0, 0.25, -0.32, 0.05],
      [0.6, ...GUARD_LEFT],
      [1.82, ...GUARD_LEFT],
      [1.95, 0.05, 0.33, 0.58],
      [2.08, ...GUARD_LEFT],
      [4.9, ...GUARD_LEFT],
      [5.0, 0.26, 0.43, 0.22],
      [5.15, 0.26, 0.43, 0.22],
      [5.3, ...GUARD_LEFT],
      [5.95, ...GUARD_LEFT],
      [6.15, ...SIDE_LEFT],
      [6.6, ...SIDE_LEFT],
      [7.9, 0.25, -0.32, 0.05],
    ],
    r: [
      [0, -0.25, -0.32, 0.05],
      [0.6, ...GUARD_RIGHT],
      [2.1, ...GUARD_RIGHT],
      [2.22, 0, 0.31, 0.58],
      [2.38, ...GUARD_RIGHT],
      [5.05, ...GUARD_RIGHT],
      [5.15, -0.13, -0.04, 0.22],
      [5.28, -0.05, 0.42, 0.42],
      [5.45, ...GUARD_RIGHT],
      [5.95, ...GUARD_RIGHT],
      [6.15, ...SIDE_RIGHT],
      [6.6, ...SIDE_RIGHT],
      [7.9, -0.25, -0.32, 0.05],
    ],
  },
  elbows: {
    l: keys([
      [4.9, 0],
      [5.0, 0.9],
      [5.15, 0.9],
      [5.3, 0],
    ]),
  },
  plants: {
    l: [
      plant({ time: -10, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw }),
      plant({ time: 0.55, x: -0.4, z: -0.1, yaw: LEAD_FACING + FRONT_TOE, swing: 0.25, lift: 0.07 }),
      plant({ time: 1.93, x: -0.12, z: -0.1, yaw: LEAD_FACING + FRONT_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 2.5, x: -0.32, z: -0.1, yaw: LEAD_FACING + FRONT_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 3.78, x: -0.13, z: -0.04, yaw: LEAD_FACING + FRONT_TOE, swing: 0.15, lift: 0.06 }),
      plant({ time: 4.62, x: -0.28, z: -0.1, yaw: LEAD_FACING + FRONT_TOE, swing: 0.2, lift: 0.06 }),
      plant({ time: 5.75, x: -0.58, z: -0.1, yaw: LEAD_FACING + FRONT_TOE, swing: 0.2, lift: 0.1 }),
      plant({ time: 7.25, x: -0.3, z: -0.03, yaw: 0.6, swing: 0.3, lift: 0.07 }),
      plant({ time: 7.85, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw, swing: 0.3, lift: 0.07 }),
    ],
    r: [
      plant({ time: -10, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw }),
      plant({ time: 0.7, x: -0.82, z: 0.12, yaw: LEAD_FACING + REAR_TOE, swing: 0.3, lift: 0.07 }),
      plant({ time: 2.05, x: -0.55, z: 0.12, yaw: LEAD_FACING + REAR_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 2.4, x: -0.75, z: 0.12, yaw: LEAD_FACING + REAR_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 4.5, x: -0.7, z: 0.12, yaw: LEAD_FACING + REAR_TOE, swing: 0.7, lift: 0.05 }),
      plant({ time: 5.75, x: -1.0, z: 0.12, yaw: LEAD_FACING + REAR_TOE, swing: 0.2, lift: 0.1 }),
      plant({ time: 6.05, x: -0.74, z: 0.11, yaw: LEAD_FACING - 0.2, swing: 0.25, lift: 0.06 }),
      plant({ time: 7.55, x: 0.02, z: 0.04, yaw: -0.2, swing: 0.3, lift: 0.07 }),
      plant({ time: 8.1, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw, swing: 0.25, lift: 0.05 }),
    ],
  },
  air: [
    // The sweep: the right leg reaches out along the floor and turns with the body.
    { sides: ['r'], start: 3.8, full: 3.9, release: 4.36, end: 4.46, frame: 'root', target: () => [-0.8, 0.09, -0.12], pitch: () => 0.2 },
  ],
};

// Partner: drops in, slips the punches, spinning hook kick, jumps the sweep, throws a cross, bows, flips away.
const PARTNER_FACING = -RIGHT_TURN;
const FALL: Flight = { start: 0.25, end: 0.964, from: 3.4, to: 0.9 };
const JUMP: Flight = { start: 3.95, end: 4.32, from: 0.92, to: 0.9 };
const EXIT: Flight = { start: 6.92, end: 7.5, from: 0.95, to: 3.0 };
const kick = keys([
  [2.8, 0],
  [2.98, 1],
  [3.2, 1],
  [3.38, 0],
]);
const partner: Choreography = {
  x: keys([
    [0, 0.72],
    [1.75, 0.72],
    [1.97, 0.82],
    [2.25, 0.9],
    [2.62, 0.9],
    [2.8, 0.62],
    [3.38, 0.62],
    [3.55, 0.7],
    [4.85, 0.7],
    [4.98, 0.52],
    [5.3, 0.68],
    [5.5, 0.68],
    [5.75, 0.98],
    [6.9, 0.98],
    [7.5, 1.8],
  ]),
  yaw: keys([
    [0, PARTNER_FACING],
    [2.78, PARTNER_FACING],
    [3.38, PARTNER_FACING - TURN],
  ]),
  flights: [FALL, JUMP, EXIT],
  height: sloped([
    [0, 3.4, 0],
    takeOff(FALL),
    touchDown(FALL),
    [1.08, 0.56, 0],
    [1.32, 0.58, 0],
    [1.68, 0.86, 0],
    [2.62, 0.86, 0],
    [2.72, 0.8, 0],
    [2.86, 0.9, 0],
    [3.25, 0.9, 0],
    [3.45, 0.84, 0],
    [3.85, 0.84, 0],
    [3.92, 0.74, 0],
    takeOff(JUMP),
    touchDown(JUMP),
    [4.42, 0.72, 0],
    [4.6, 0.85, 0],
    [4.98, 0.8, 0],
    [5.3, 0.86, 0],
    [5.6, 0.8, 0],
    [5.68, 0.95, 0],
    [5.82, 0.82, 0],
    [6.05, 0.9, 0],
    [6.2, 0.93, 0],
    [6.6, 0.93, 0],
    [6.84, 0.7, 0],
    takeOff(EXIT),
    touchDown(EXIT),
  ]),
  body: {
    pelvisPitch: keys([
      [0, 0.05],
      [0.96, 0.1],
      [1.08, 0.55],
      [1.32, 0.5],
      [1.68, 0.08],
      [2.62, 0.08],
      [2.8, -0.08],
      [3.3, -0.08],
      [3.45, 0.08],
      [3.9, 0.2],
      [4.1, 0.28],
      [4.32, 0.15],
      [4.42, 0.3],
      [4.6, 0.08],
      [4.98, 0.14],
      [5.2, 0.08],
      [5.28, -0.1],
      [5.45, 0.08],
      [6.05, 0.03],
      [6.2, 0.14],
      [6.5, 0.14],
      [6.7, 0.02],
      [6.84, 0.25],
      [6.92, -0.1],
      [7.5, -3.0],
    ]),
    pelvisRoll: keys([
      [2.8, 0],
      [2.96, -0.5],
      [3.2, -0.5],
      [3.38, 0],
    ]),
    pelvisYaw: keys([
      [0, 0],
      [1.55, 0],
      [1.75, -0.35],
      [2.7, -0.35],
      [2.8, 0],
      [3.4, 0],
      [3.55, -0.35],
      [4.88, -0.35],
      [4.98, 0.15],
      [5.2, -0.35],
      [5.95, -0.35],
      [6.1, 0],
    ]),
    chestYaw: keys([
      [0, 0],
      [1.55, 0],
      [1.75, -0.15],
      [2.7, -0.15],
      [2.8, 0],
      [3.4, 0],
      [3.55, -0.15],
      [4.88, -0.15],
      [4.98, 0.35],
      [5.2, -0.15],
      [5.95, -0.15],
      [6.1, 0],
    ]),
    headYaw: keys([
      [0, 0],
      [1.55, 0],
      [1.75, 0.45],
      [2.7, 0.45],
      [2.8, 0],
      [3.4, 0],
      [3.55, 0.45],
      [4.88, 0.45],
      [4.98, -0.4],
      [5.2, 0.45],
      [5.95, 0.45],
      [6.1, 0],
    ]),
    spinePitch: keys([
      [0, 0],
      [1.08, 0.2],
      [1.4, 0.15],
      [1.7, 0],
      [1.85, 0],
      [1.97, -0.22],
      [2.1, -0.05],
      [2.22, -0.25],
      [2.4, 0],
      [3.9, 0],
      [4.1, 0.2],
      [4.32, 0],
      [5.2, 0],
      [5.3, -0.3],
      [5.45, 0],
      [6.05, 0],
      [6.2, 0.2],
      [6.5, 0.2],
      [6.7, 0],
      [6.92, -0.2],
      [7.3, -0.4],
    ]),
    spineRoll: keys([
      [1.85, 0],
      [1.97, 0.2],
      [2.1, 0],
      [2.22, -0.15],
      [2.4, 0],
    ]),
    chestPitch: keys([
      [6.05, 0],
      [6.2, 0.15],
      [6.5, 0.15],
      [6.7, 0],
    ]),
    headPitch: keys([
      [0, 0.3],
      [0.96, 0.3],
      [1.2, -0.1],
      [1.6, 0],
      [6.05, 0],
      [6.2, 0.3],
      [6.5, 0.3],
      [6.7, 0],
    ]),
  },
  hands: {
    l: [
      [0, 0.45, 0.22, 0.05],
      [0.96, 0.45, 0.25, 0.08],
      [1.1, 0.36, -0.12, 0.26],
      [1.42, 0.36, -0.12, 0.26],
      [1.72, ...GUARD_LEFT],
      [3.9, ...GUARD_LEFT],
      [4.1, 0.32, 0.15, 0.22],
      [4.35, ...GUARD_LEFT],
      [6.0, ...GUARD_LEFT],
      [6.15, ...SIDE_LEFT],
      [6.6, ...SIDE_LEFT],
      [6.84, 0.2, -0.28, -0.24],
      [6.96, 0.2, 0.5, 0.1],
      [7.5, 0.2, 0, 0.3],
    ],
    r: [
      [0, -0.45, 0.22, 0.05],
      [0.96, -0.45, 0.25, 0.08],
      [1.1, -0.2, -0.4, 0.3],
      [1.42, -0.2, -0.4, 0.3],
      [1.72, ...GUARD_RIGHT],
      [3.9, ...GUARD_RIGHT],
      [4.1, -0.32, 0.15, 0.22],
      [4.35, ...GUARD_RIGHT],
      [4.88, ...GUARD_RIGHT],
      [4.99, 0, 0.31, 0.58],
      [5.12, ...GUARD_RIGHT],
      [6.0, ...GUARD_RIGHT],
      [6.15, ...SIDE_RIGHT],
      [6.6, ...SIDE_RIGHT],
      [6.84, -0.2, -0.28, -0.24],
      [6.96, -0.2, 0.5, 0.1],
      [7.5, -0.2, 0, 0.3],
    ],
  },
  plants: {
    l: [
      plant({ time: -10, x: 0.52, z: 0.14, yaw: PARTNER_FACING + FRONT_TOE }),
      plant({ time: 2.3, x: 0.7, z: 0.1, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 2.72, x: 0.55, z: 0.05, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.14, lift: 0.05 }),
      plant({ time: 4.32, x: 0.55, z: 0.07, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.37 }),
      plant({ time: 4.92, x: 0.36, z: 0.1, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.12, lift: 0.05 }),
      plant({ time: 5.3, x: 0.52, z: 0.1, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 5.75, x: 0.78, z: 0.1, yaw: PARTNER_FACING + FRONT_TOE, swing: 0.2, lift: 0.1 }),
    ],
    r: [
      plant({ time: -10, x: 0.92, z: -0.16, yaw: PARTNER_FACING + REAR_TOE }),
      plant({ time: 2.15, x: 1.1, z: -0.12, yaw: PARTNER_FACING + REAR_TOE, swing: 0.15, lift: 0.05 }),
      plant({ time: 3.45, x: 0.9, z: -0.12, yaw: PARTNER_FACING + REAR_TOE, swing: 0.65 }),
      plant({ time: 4.32, x: 0.9, z: -0.12, yaw: PARTNER_FACING + REAR_TOE, swing: 0.37 }),
      plant({ time: 5.75, x: 1.16, z: -0.12, yaw: PARTNER_FACING + REAR_TOE, swing: 0.2, lift: 0.1 }),
      plant({ time: 6.05, x: 1.0, z: -0.1, yaw: PARTNER_FACING - 0.2, swing: 0.25, lift: 0.06 }),
    ],
  },
  air: [
    // Falling in: legs loose under the hips, toes down.
    airUnderHips({ start: 0.2, full: 0.25, release: 0.86, end: 0.964, y: -0.74, z: 0.08, point: 0.6 }),
    // The spinning hook kick: the knee comes up, the leg opens to the side at head height, and folds back.
    {
      sides: ['r'],
      start: 2.78,
      full: 2.86,
      release: 3.36,
      end: 3.46,
      frame: 'pelvis',
      target: ({ time }) => {
        const amount = kick(time);
        return [lerp(-0.24, -0.74, amount), lerp(-0.22, 0.38, amount), lerp(0.28, -0.1, amount)];
      },
      pitch: ({ pose }) => pose.pelvisPitch + 0.3,
    },
    airUnderHips({ start: 3.95, full: 4.0, release: 4.24, end: 4.32, y: -0.4, z: 0.16, point: 0.8 }),
    airUnderHips({ start: 6.9, full: 6.98, release: 99, end: 100, y: -0.18, z: 0.2, point: 1.2 }),
  ],
};

function airUnderHips({
  start,
  full,
  release,
  end,
  y,
  z,
  point,
}: {
  start: number;
  full: number;
  release: number;
  end: number;
  y: number;
  z: number;
  point: number;
}): AirMove {
  return {
    sides: SIDES,
    start,
    full,
    release,
    end,
    frame: 'pelvis',
    target: ({ side }) => [sign(side) * 0.12, y, z],
    pitch: ({ pose }) => pose.pelvisPitch + point,
  };
}

const performLead = perform({ choreography: lead, base: guard });
const performPartner = perform({ choreography: partner, base: guard });
const spinning = (time: number, start: number, end: number): number => ease(time, start, start + 0.08) * (1 - ease(time, end - 0.1, end));
const sweepHands = (time: number): number => ease(time, 3.8, 3.9) * (1 - ease(time, 4.34, 4.45));
const landingHand = (time: number): number => ease(time, 0.96, 1.05) * (1 - ease(time, 1.35, 1.55));
const keyed = { x: 0, y: 0, z: 0 };

// Hands on the floor are placed in the root frame, then eased in from the keyframed hands.
function touchFloor({ pose, side, amount, x, z }: { pose: Pose; side: Side; amount: number; x: number; z: number }): void {
  if (amount <= 0) return;
  keyed.x = pose[`${side}HandX`];
  keyed.y = pose[`${side}HandY`];
  keyed.z = pose[`${side}HandZ`];
  placeHandFromRoot({ pose, side, x, y: 0.05, z });
  pose[`${side}HandX`] = lerp(keyed.x, pose[`${side}HandX`], amount);
  pose[`${side}HandY`] = lerp(keyed.y, pose[`${side}HandY`], amount);
  pose[`${side}HandZ`] = lerp(keyed.z, pose[`${side}HandZ`], amount);
}

export const SPARRING: Clip = {
  id: 'sparring',
  title: 'Sparring',
  summary: 'Two fighters trade punches, a spinning kick and a sweep, each bandana simulated on its own.',
  duration: DURATION,
  // The partner drops in from above and leaves the same way; those leaps start and end out of frame.
  bounds: { min: [-1.4, -0.05, -0.9], max: [1.9, 2.55, 0.95] },
  evaluate: ({ time, lead: leadPose, partner: partnerPose }) => {
    performLead({ time, pose: leadPose });
    // The planted foot pivots with the body through a spin instead of twisting the knee.
    leadPose.lFootYaw = lerpAngle(leadPose.lFootYaw, FRONT_TOE, spinning(time, 3.82, 4.46));
    const sweeping = sweepHands(time);
    for (const side of SIDES) touchFloor({ pose: leadPose, side, amount: sweeping, x: sign(side) * 0.17, z: 0.32 });
    if (time > 7.9) blendPose({ from: leadPose, to: stance, amount: ease(time, 7.9, 8.3), out: leadPose });

    performPartner({ time, pose: partnerPose });
    partnerPose.lFootYaw = lerpAngle(partnerPose.lFootYaw, FRONT_TOE, spinning(time, 2.76, 3.46));
    touchFloor({ pose: partnerPose, side: 'r', amount: landingHand(time), x: -0.24, z: 0.3 });
  },
  partnerOnStage: (time) => time >= 0.24 && time < 7.45,
};
