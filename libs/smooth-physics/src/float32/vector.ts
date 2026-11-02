import { add, divide, fround, inverseSquareRoot, maximum, minimum, multiply, interpolate, SMALLEST_NORMAL_FLOAT32, squareRoot, subtract } from './scalar.ts';

export type Vector3 = [x: number, y: number, z: number];
export type ReadonlyVector3 = readonly [x: number, y: number, z: number];
export type Vector2 = [u: number, v: number];

export const vector = (x = 0, y = 0, z = 0): Vector3 => [fround(x), fround(y), fround(z)];
export const copyVector = (value: ReadonlyVector3): Vector3 => [value[0], value[1], value[2]];

export const addVectors = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [add(left[0], right[0]), add(left[1], right[1]), add(left[2], right[2])];
export const subtractVectors = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [
  subtract(left[0], right[0]),
  subtract(left[1], right[1]),
  subtract(left[2], right[2]),
];
export const multiplyVectors = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [
  multiply(left[0], right[0]),
  multiply(left[1], right[1]),
  multiply(left[2], right[2]),
];
export const scaleVector = (value: ReadonlyVector3, factor: number): Vector3 => [
  multiply(value[0], factor),
  multiply(value[1], factor),
  multiply(value[2], factor),
];
export const divideVector = (value: ReadonlyVector3, divisor: number): Vector3 => [
  divide(value[0], divisor),
  divide(value[1], divisor),
  divide(value[2], divisor),
];
export const negateVector = (value: ReadonlyVector3): Vector3 => [-value[0], -value[1], -value[2]];

export const dot = (left: ReadonlyVector3, right: ReadonlyVector3): number =>
  add(add(multiply(left[0], right[0]), multiply(left[1], right[1])), multiply(left[2], right[2]));
export const cross = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [
  subtract(multiply(left[1], right[2]), multiply(left[2], right[1])),
  subtract(multiply(left[2], right[0]), multiply(left[0], right[2])),
  subtract(multiply(left[0], right[1]), multiply(left[1], right[0])),
];
export const length = (value: ReadonlyVector3): number => squareRoot(dot(value, value));
export const lengthSquared = (value: ReadonlyVector3): number => dot(value, value);
export const distance = (from: ReadonlyVector3, to: ReadonlyVector3): number => length(subtractVectors(to, from));
export const distanceSquared = (from: ReadonlyVector3, to: ReadonlyVector3): number => lengthSquared(subtractVectors(to, from));

export const normalize = (value: ReadonlyVector3): Vector3 => scaleVector(value, inverseSquareRoot(dot(value, value)));
// Returns a copy of the fallback for a zero or subnormal length, whose inverse square root would be infinite or
// inaccurate.
export function normalizeSafe(value: ReadonlyVector3, fallback: ReadonlyVector3 = ZERO): Vector3 {
  const squaredLength = dot(value, value);
  return squaredLength > SMALLEST_NORMAL_FLOAT32 ? scaleVector(value, inverseSquareRoot(squaredLength)) : copyVector(fallback);
}

export const interpolateVectors = (from: ReadonlyVector3, to: ReadonlyVector3, amount: number): Vector3 => [
  interpolate(from[0], to[0], amount),
  interpolate(from[1], to[1], amount),
  interpolate(from[2], to[2], amount),
];
export const minimumVector = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [
  minimum(left[0], right[0]),
  minimum(left[1], right[1]),
  minimum(left[2], right[2]),
];
export const maximumVector = (left: ReadonlyVector3, right: ReadonlyVector3): Vector3 => [
  maximum(left[0], right[0]),
  maximum(left[1], right[1]),
  maximum(left[2], right[2]),
];

// Constants are plain arrays with readonly types, not Object.freeze: a frozen array has another V8 elements kind,
// which made every vector helper polymorphic and slower.
export const ZERO: ReadonlyVector3 = [0, 0, 0];
export const UP: ReadonlyVector3 = [0, 1, 0];
export const FORWARD: ReadonlyVector3 = [0, 0, 1];
