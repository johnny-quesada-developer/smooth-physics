// Every operation rounds to binary32, so results are reproducible across engines. Positional parameters on purpose:
// these are the hottest functions (see Development in the README).

export const { fround } = Math;

export const add = (left: number, right: number): number => fround(left + right);
export const subtract = (left: number, right: number): number => fround(left - right);
export const multiply = (left: number, right: number): number => fround(left * right);
export const divide = (numerator: number, denominator: number): number => fround(numerator / denominator);

export const squareRoot = (value: number): number => fround(Math.sqrt(value));
export const inverseSquareRoot = (value: number): number => divide(1, squareRoot(value));
export const arcCosine = (value: number): number => fround(Math.acos(value));
export const sine = (angle: number): number => fround(Math.sin(angle));
export const cosine = (angle: number): number => fround(Math.cos(angle));
export const arcTangent2 = (y: number, x: number): number => fround(Math.atan2(y, x));

export const minimum = (left: number, right: number): number => (left < right ? left : right);
export const maximum = (left: number, right: number): number => (left > right ? left : right);
export const clamp = (value: number, lower: number, upper: number): number => maximum(lower, minimum(upper, value));
export const saturate = (value: number): number => clamp(value, 0, 1);
export const clampSigned = (value: number): number => clamp(value, -1, 1);
export const interpolate = (from: number, to: number, amount: number): number => add(from, multiply(amount, subtract(to, from)));
export const inverseInterpolate = (from: number, to: number, value: number): number => divide(subtract(value, from), subtract(to, from));
export const toDegrees = (radians: number): number => multiply(radians, fround(57.29578));

export const PI = fround(Math.PI);
export const SMALLEST_NORMAL_FLOAT32 = fround(1.175494351e-38);
