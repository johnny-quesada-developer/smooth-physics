import { curve, ease, lerp } from '../motion/curves';
import { perform, type Choreography } from '../motion/choreography';
import type { Plant } from '../motion/footwork';
import { blendPose, standingPose } from '../motion/pose';
import type { Clip } from './types';

const DURATION = 7.6;
// Facing into the wind, which blows from the left of the stage, turned a little toward the camera.
const FACING = -Math.PI / 2 + 0.35;
const BREATH = 3.4;

// A breeze that never quite stops, with two gusts that rise and fade; the second is stronger and gustier.
const gust = (time: number): number => 0.9 + 6.5 * (ease(time, 1.1, 2.3) - ease(time, 2.6, 3.7)) + 9.5 * (ease(time, 4.4, 5.4) - ease(time, 5.9, 6.9));
const strength = (time: number): number => (gust(time) - 0.9) / 9.5;

const stance = standingPose();
const step = ({ time, x, z, yaw, swing = 0, lift = 0.06 }: { time: number; x: number; z: number; yaw: number; swing?: number; lift?: number }): Plant => ({
  time,
  x,
  z,
  yaw,
  swing,
  lift,
});

const breathing = (time: number): number => Math.sin((Math.PI * 2 * time) / BREATH);
const settle = (time: number): number => ease(time, 0.5, 1.1) * (1 - ease(time, 6.75, 7.3));
const choreography: Choreography = {
  x: () => 0,
  yaw: curve([
    [0, 0],
    [0.25, 0],
    [0.85, FACING],
    [6.75, FACING],
    [7.3, 0],
  ]),
  flights: [],
  height: (time) => lerp(0.93, 0.895, settle(time)) + 0.006 * breathing(time) * settle(time) - 0.02 * strength(time),
  body: {
    pelvisPitch: (time) => (0.03 + 0.06 * strength(time)) * settle(time),
    pelvisYaw: (time) => -0.22 * settle(time),
    pelvisX: (time) => 0.02 * strength(time) * settle(time),
    spinePitch: (time) => (0.02 + 0.05 * strength(time)) * settle(time),
    // The chest lifts on each breath in and settles on the way out.
    chestPitch: (time) => -0.035 * breathing(time) * settle(time),
    chestYaw: (time) => 0.1 * settle(time),
    headYaw: (time) => 0.12 * settle(time),
    headPitch: (time) => (0.02 * breathing(time - 0.4) + 0.14 * strength(time)) * settle(time),
  },
  hands: {
    l: [
      [0, 0.25, -0.32, 0.05],
      [1.0, 0.24, -0.33, 0.02],
      [4.9, 0.24, -0.33, 0.02],
      [5.4, 0.07, 0.3, 0.27],
      [6.3, 0.07, 0.3, 0.27],
      [6.9, 0.24, -0.33, 0.02],
      [7.3, 0.25, -0.32, 0.05],
    ],
    r: [
      [0, -0.25, -0.32, 0.05],
      [1.0, -0.25, -0.33, -0.02],
      [6.9, -0.25, -0.33, -0.02],
      [7.3, -0.25, -0.32, 0.05],
    ],
  },
  // The lead arm comes up to shield the eyes from the strongest gust.
  elbows: {
    l: curve([
      [4.9, 0],
      [5.4, 0.55],
      [6.3, 0.55],
      [6.9, 0],
    ]),
  },
  plants: {
    l: [
      step({ time: -10, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw }),
      step({ time: 0.75, x: -0.12, z: 0.17, yaw: FACING - 0.1, swing: 0.35 }),
      step({ time: 7.3, x: stance.lFootX, z: stance.lFootZ, yaw: stance.lFootYaw, swing: 0.32 }),
    ],
    r: [
      step({ time: -10, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw }),
      step({ time: 1.0, x: 0.15, z: -0.18, yaw: FACING - 0.55, swing: 0.3 }),
      step({ time: 7.05, x: stance.rFootX, z: stance.rFootZ, yaw: stance.rFootYaw, swing: 0.3 }),
    ],
  },
  air: [],
};
const performWind = perform({ choreography, base: stance });

export const WIND: Clip = {
  id: 'wind',
  title: 'Wind',
  summary: 'Standing into the wind as gusts rise and fade, applied as a force on the cloth.',
  duration: DURATION,
  bounds: { min: [-0.5, 0, -0.5], max: [0.8, 1.8, 0.5] },
  evaluate: ({ time, lead }) => {
    performWind({ time, pose: lead });
    if (time > 7.3) blendPose({ from: lead, to: stance, amount: ease(time, 7.3, 7.6), out: lead });
  },
  partnerOnStage: () => false,
  wind: ({ time, out }) => {
    const force = gust(time);
    // Turbulence: the gust breaks up, and the tails flutter instead of standing still in a steady stream.
    const flutter = 1 + 0.22 * Math.sin(time * 11.3) * Math.sin(time * 3.7) + 0.12 * Math.sin(time * 23.1);
    out[0] = force * flutter;
    out[1] = force * 0.12;
    out[2] = -force * (0.22 + 0.18 * Math.sin(time * 7.1));
    return true;
  },
};
