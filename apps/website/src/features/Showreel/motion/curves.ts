export type Key = readonly [time: number, value: number];
// A key with its own slope, for motion whose speed matters at the key (a sprint arriving at a stop).
export type SlopedKey = readonly [time: number, value: number, slope: number];
export type Curve = (time: number) => number;

export const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);
export const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

// 0 before start, 1 after end, with zero speed and acceleration at both ends.
export function ease(time: number, start: number, end: number): number {
  const amount = clamp((time - start) / (end - start), 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

// Takes the short way round, so a yaw of 350° blends to 10° through 0°.
export function lerpAngle(from: number, to: number, amount: number): number {
  const turn = Math.PI * 2;
  const difference = ((((to - from) % turn) + turn * 1.5) % turn) - Math.PI;
  return from + difference * amount;
}

// Monotone cubic (Fritsch–Carlson): smooth through every key without overshooting between them, so a value that
// stops at a key eases in and out of it, and holds stay flat.
export function curve(keys: readonly Key[]): Curve {
  const times = keys.map(([time]) => time);
  const values = keys.map(([, value]) => value);
  const count = keys.length;
  const secants = times.slice(0, -1).map((time, index) => ((values[index + 1] ?? 0) - (values[index] ?? 0)) / ((times[index + 1] ?? time) - time || 1));
  const slopes = times.map((_, index) => {
    if (index === 0 || index === count - 1) return 0;
    const before = secants[index - 1] ?? 0,
      after = secants[index] ?? 0;
    if (before * after <= 0) return 0;
    const slope = (before + after) / 2;
    // Limits the slope so the segment cannot overshoot either neighbour.
    return Math.sign(slope) * Math.min(Math.abs(slope), 3 * Math.abs(before), 3 * Math.abs(after));
  });
  return hermiteOf({ times, values, slopes });
}

// Cubic Hermite through keys with the given slopes.
export function sloped(keys: readonly SlopedKey[]): Curve {
  return hermiteOf({ times: keys.map(([time]) => time), values: keys.map(([, value]) => value), slopes: keys.map(([, , slope]) => slope) });
}

function hermiteOf({ times, values, slopes }: { times: readonly number[]; values: readonly number[]; slopes: readonly number[] }): Curve {
  const last = times.length - 1;
  return (time) => {
    if (last < 0) return 0;
    if (time <= (times[0] ?? 0)) return values[0] ?? 0;
    if (time >= (times[last] ?? 0)) return values[last] ?? 0;
    let index = 0;
    while (index < last - 1 && time >= (times[index + 1] ?? 0)) index++;
    const start = times[index] ?? 0,
      span = (times[index + 1] ?? start) - start;
    const amount = (time - start) / span,
      square = amount * amount,
      cube = square * amount;
    return (
      (2 * cube - 3 * square + 1) * (values[index] ?? 0) +
      (cube - 2 * square + amount) * span * (slopes[index] ?? 0) +
      (-2 * cube + 3 * square) * (values[index + 1] ?? 0) +
      (cube - square) * span * (slopes[index + 1] ?? 0)
    );
  };
}

// The derivative of a curve by central difference, for speeds that drive gait and lean.
export function rateOf({ curve: source, time, step = 1 / 240 }: { curve: Curve; time: number; step?: number }): number {
  return (source(time + step) - source(time - step)) / (2 * step);
}
