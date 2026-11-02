import { divide, fround, interpolate, multiply, saturate, subtract, clamp } from './float32/scalar.ts';
import type { CurveKey, CurveRecord } from './scene-format/types.ts';

// A curve as 16 values sampled evenly over times 0 to 1.
export type SampledCurve = readonly number[];

// The keyed curve's value at the time: constant outside the keys and a cubic Hermite segment between two keys, or the
// start key's value when a slope between them is infinite (a stepped key).
export function evaluateKeys({ keys, time }: { keys: readonly CurveKey[]; time: number }): number {
  const firstKey = keys[0];
  const lastKey = keys[keys.length - 1];
  if (!firstKey || !lastKey) return 0;
  if (time <= firstKey.time) return firstKey.value;
  if (time >= lastKey.time) return lastKey.value;

  let keyIndex = 0;
  while (keyIndex < keys.length - 2 && time > keys[keyIndex + 1].time) keyIndex++;
  const startKey = keys[keyIndex];
  const endKey = keys[keyIndex + 1];
  if (!Number.isFinite(startKey.outSlope) || !Number.isFinite(endKey.inSlope)) return startKey.value;

  // The Hermite basis weights the two values and the two slopes, which are per unit time, so they scale by the span.
  const span = endKey.time - startKey.time;
  const progress = (time - startKey.time) / span;
  const progressSquared = progress * progress;
  const progressCubed = progressSquared * progress;
  const value =
    (2 * progressCubed - 3 * progressSquared + 1) * startKey.value +
    (progressCubed - 2 * progressSquared + progress) * startKey.outSlope * span +
    (-2 * progressCubed + 3 * progressSquared) * endKey.value +
    (progressCubed - progressSquared) * endKey.inSlope * span;
  return fround(value);
}

// The curve's 16 samples, scaled by its value; a disabled curve is that value at every sample.
export function sampleCurve(curve: CurveRecord): SampledCurve {
  const scale = fround(curve.value);
  if (!curve.isCurve) return Array.from({ length: 16 }, () => scale);
  const keys = curve.keys.map((key) => ({ time: fround(key.time), value: fround(key.value), inSlope: fround(key.inSlope), outSlope: fround(key.outSlope) }));
  return Array.from({ length: 16 }, (_, sample) => multiply(evaluateKeys({ keys, time: divide(sample, 15) }), scale));
}

const SAMPLE_INTERVAL = fround(1 / 15);

// Linear interpolation between the two samples around the time.
export function evaluateCurve(samples: SampledCurve, time: number): number {
  const sampleIndex = Math.trunc(multiply(saturate(time), 15));
  const fraction = divide(subtract(time, multiply(sampleIndex, SAMPLE_INTERVAL)), SAMPLE_INTERVAL);
  return interpolate(samples[clamp(sampleIndex, 0, 15)], samples[clamp(sampleIndex + 1, 0, 15)], fraction);
}

export const scaleCurve = (samples: SampledCurve, factor: number): SampledCurve => samples.map((sample) => multiply(sample, factor));
