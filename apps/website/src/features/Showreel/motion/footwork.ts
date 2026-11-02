import { clamp, ease, lerp, lerpAngle } from './curves';
import { ANKLE_HEIGHT, sign, SIDES, type Side } from './pose';

// A foot lands on the floor at time, in world coordinates, after a swing of `swing` seconds that peaks at `lift`.
export type Plant = { readonly time: number; readonly x: number; readonly z: number; readonly yaw: number; readonly swing: number; readonly lift: number };
export type FootSample = { x: number; y: number; z: number; yaw: number; pitch: number };
export type RootSample = { x: number; z: number; yaw: number };

export type StepStyle = {
  // Toe angle at touchdown: negative lands on the heel (a walk), positive on the ball (a run).
  readonly strike: number;
  // The share of the swing the foot stays back while it rises, as the heel kicks up behind a runner.
  readonly kick: number;
  readonly heelOff: number;
};

export const WALK: StepStyle = { strike: -0.18, kick: 0.05, heelOff: 0.12 };
export const RUN: StepStyle = { strike: 0.12, kick: 0.22, heelOff: 0.07 };
export const SHUFFLE: StepStyle = { strike: -0.05, kick: 0, heelOff: 0.05 };

const TOE_LEVER = 0.13;

export function sampleFoot({ plants, time, style, out }: { plants: readonly Plant[]; time: number; style: StepStyle; out: FootSample }): FootSample {
  let index = 0;
  while (index < plants.length - 1 && time >= (plants[index + 1]?.time ?? Infinity) - (plants[index + 1]?.swing ?? 0)) index++;
  const plant = plants[index];
  if (!plant) return out;
  const next = plants[index + 1];
  const landed = time >= plant.time;
  if (landed || index === 0) {
    // Planted: flat, settling from the strike angle, and rolling onto the toes before the next lift.
    const settle = 1 - ease(time, plant.time, plant.time + 0.07);
    const liftAt = next ? next.time - next.swing : Infinity;
    const heel = next ? ease(time, liftAt - style.heelOff, liftAt) : 0;
    const pitch = style.strike * settle * (index === 0 ? 0 : 1) + 0.5 * heel;
    out.x = plant.x;
    out.z = plant.z;
    out.y = ANKLE_HEIGHT + TOE_LEVER * Math.sin(Math.max(0, pitch));
    out.yaw = plant.yaw;
    out.pitch = pitch;
    return out;
  }
  const previous = plants[index - 1] ?? plant;
  const amount = clamp((time - (plant.time - plant.swing)) / plant.swing, 0, 1);
  const travel = ease(amount, style.kick, 1);
  out.x = lerp(previous.x, plant.x, travel);
  out.z = lerp(previous.z, plant.z, travel);
  out.yaw = lerpAngle(previous.yaw, plant.yaw, ease(amount, 0, 0.8));
  // The arc peaks early, while the foot is still behind, and comes down flatter.
  const arc = Math.sin(Math.PI * Math.pow(amount, 0.8));
  out.pitch = lerp(0.5, style.strike, ease(amount, 0, 0.75));
  out.y = ANKLE_HEIGHT + TOE_LEVER * Math.sin(Math.max(0, out.pitch)) * (1 - amount) + plant.lift * arc;
  return out;
}

export type GaitStyle = {
  // Steps per second (both feet) at a speed in m/s.
  readonly cadence: (speed: number) => number;
  // The share of each foot's cycle spent on the floor.
  readonly duty: (speed: number) => number;
  readonly width: (speed: number) => number;
  readonly lift: (speed: number) => number;
  readonly toeOut: number;
};

export const RUNNING: GaitStyle = {
  cadence: (speed) => 2.1 + 0.42 * speed,
  duty: (speed) => clamp(0.62 - 0.1 * speed, 0.28, 0.62),
  width: (speed) => lerp(0.12, 0.055, clamp(speed / 4, 0, 1)),
  lift: (speed) => lerp(0.06, 0.3, clamp(speed / 4.5, 0, 1)),
  toeOut: 0.08,
};

export const WALKING: GaitStyle = {
  cadence: (speed) => 1.6 + 0.25 * speed,
  duty: () => 0.62,
  width: () => 0.11,
  lift: () => 0.07,
  toeOut: 0.1,
};

export type Gait = {
  readonly plants: Readonly<Record<Side, readonly Plant[]>>;
  // How far forward each foot is in its cycle, from -1 (just lifted, behind) to 1 (just landed, ahead).
  forward(side: Side, time: number): number;
  // 1 at the middle of a stance, when the runner is lowest; 0 in the air.
  compression(time: number): number;
};

const STEP = 1 / 240;

// Footsteps for a root that moves along a path: each foot lands under the point the root reaches at the middle of
// that stance, so planted feet never slide. Both feet start planted at `initial`; `first` lifts at `start`; no foot
// lifts after `end`, and a foot in the air then lands under the root.
export function bakeGait({
  root,
  speed,
  start,
  end,
  initial,
  first,
  style,
}: {
  root: (time: number, out: RootSample) => RootSample;
  speed: (time: number) => number;
  start: number;
  end: number;
  initial: Readonly<Record<Side, RootSample>>;
  first: Side;
  style: GaitStyle;
}): Gait {
  const times: number[] = [],
    phases: number[] = [],
    duties: number[] = [];
  const firstDuty = style.duty(speed(start));
  let phase = first === 'r' ? firstDuty - 0.5 : firstDuty;
  const stance = (side: Side, at: number, duty: number): boolean => fraction(phase + (side === 'r' ? 0.5 : 0)) < duty || at < start;
  const events: Record<Side, { lift: number; land: number }[]> = { l: [], r: [] };
  const was: Record<Side, boolean> = { l: true, r: true };
  for (let time = start; time < end + 1.5; time += STEP) {
    const current = speed(Math.min(time, end)),
      duty = style.duty(current);
    times.push(time);
    phases.push(phase);
    duties.push(duty);
    for (const side of SIDES) {
      const planted = stance(side, time, duty) || (time >= end && was[side]);
      if (was[side] && !planted) events[side].push({ lift: time, land: Infinity });
      const open = events[side][events[side].length - 1];
      if (!was[side] && planted && open) open.land = time;
      was[side] = planted;
    }
    if (time >= end && was.l && was.r) break;
    phase += (style.cadence(current) / 2) * STEP;
  }

  const sample: RootSample = { x: 0, z: 0, yaw: 0 };
  const plants: Record<Side, Plant[]> = { l: [], r: [] };
  for (const side of SIDES) {
    const s = sign(side),
      steps = events[side];
    plants[side].push({ ...initial[side], time: start - 10, swing: 0, lift: 0 });
    steps.forEach((step, index) => {
      const nextLift = steps[index + 1]?.lift ?? step.land + 0.12;
      const middle = (step.land + nextLift) / 2;
      const current = speed(Math.min(middle, end));
      root(Math.min(middle, end + 0.5), sample);
      const width = style.width(current);
      plants[side].push({
        time: step.land,
        x: sample.x + Math.cos(sample.yaw) * s * width,
        z: sample.z - Math.sin(sample.yaw) * s * width,
        yaw: sample.yaw + s * style.toeOut,
        swing: step.land - step.lift,
        lift: style.lift(speed(Math.min(step.lift, end))),
      });
    });
  }

  const at = (time: number): { phase: number; duty: number } => {
    const index = clamp(Math.floor((time - start) / STEP), 0, times.length - 1);
    return { phase: phases[index] ?? 0, duty: duties[index] ?? 0.6 };
  };
  const cycle = (side: Side, time: number): { amount: number; duty: number } => {
    const { phase: current, duty } = at(time);
    return { amount: fraction(current + (side === 'r' ? 0.5 : 0)), duty };
  };
  return {
    plants,
    forward: (side, time) => {
      if (time < start) return 0;
      const { amount, duty } = cycle(side, time);
      return amount < duty ? Math.cos((Math.PI * amount) / duty) : -Math.cos((Math.PI * (amount - duty)) / (1 - duty));
    },
    compression: (time) => {
      if (time < start || time > end) return 0;
      return Math.max(
        ...SIDES.map((side) => {
          const { amount, duty } = cycle(side, time);
          return amount < duty ? Math.sin((Math.PI * amount) / duty) : 0;
        }),
      );
    },
  };
}

function fraction(value: number): number {
  return value - Math.floor(value);
}

// The point offset from a root sample, in world coordinates: x to the root's left, z ahead of it.
export function offsetFrom({ root, x, z }: { root: RootSample; x: number; z: number }): { x: number; z: number } {
  const cosine = Math.cos(root.yaw),
    sine = Math.sin(root.yaw);
  return { x: root.x + cosine * x + sine * z, z: root.z - sine * x + cosine * z };
}

// A world point seen from a root: x to its left, z ahead.
export function toRoot({ root, x, z }: { root: RootSample; x: number; z: number }): { x: number; z: number } {
  const cosine = Math.cos(root.yaw),
    sine = Math.sin(root.yaw);
  const dx = x - root.x,
    dz = z - root.z;
  return { x: cosine * dx - sine * dz, z: sine * dx + cosine * dz };
}
