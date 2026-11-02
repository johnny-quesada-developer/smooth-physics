import { add, arcCosine, clampSigned, divide, fround, multiply, saturate, subtract } from './scalar.ts';
import {
  addVectors,
  cross,
  dot,
  FORWARD,
  length,
  negateVector,
  normalize,
  normalizeSafe,
  scaleVector,
  subtractVectors,
  UP,
  type ReadonlyVector3,
  type Vector2,
  type Vector3,
} from './vector.ts';
import { lookRotation, rotateVector, type Quaternion, type ReadonlyQuaternion } from './quaternion.ts';

const ALMOST_ZERO = fround(1e-8);

export const toRotation = (normal: ReadonlyVector3, tangent: ReadonlyVector3): Quaternion => lookRotation(tangent, normal);
export const toNormal = (rotation: ReadonlyQuaternion): Vector3 => rotateVector(rotation, UP);
export const toTangent = (rotation: ReadonlyQuaternion): Vector3 => rotateVector(rotation, FORWARD);
export const isZeroDistance = (value: ReadonlyVector3): boolean => length(value) < ALMOST_ZERO;

export function angleBetween(first: ReadonlyVector3, second: ReadonlyVector3): number {
  const firstLength = length(first);
  const secondLength = length(second);
  return arcCosine(clampSigned(divide(dot(first, second), multiply(firstLength, secondLength))));
}

export const triangleNormal = (first: ReadonlyVector3, second: ReadonlyVector3, third: ReadonlyVector3): Vector3 =>
  normalize(cross(subtractVectors(second, first), subtractVectors(third, first)));
export const triangleArea = (first: ReadonlyVector3, second: ReadonlyVector3, third: ReadonlyVector3): number =>
  length(cross(subtractVectors(second, first), subtractVectors(third, first)));

export function triangleTangent({
  positions,
  uvs,
}: {
  positions: readonly [ReadonlyVector3, ReadonlyVector3, ReadonlyVector3];
  uvs: readonly [Vector2, Vector2, Vector2];
}): Vector3 {
  const [first, second, third] = positions;
  const [firstUv, secondUv, thirdUv] = uvs;
  const firstEdge = subtractVectors(second, first);
  const secondEdge = subtractVectors(third, first);
  const firstUvEdge: Vector2 = [subtract(secondUv[0], firstUv[0]), subtract(secondUv[1], firstUv[1])];
  const secondUvEdge: Vector2 = [subtract(thirdUv[0], firstUv[0]), subtract(thirdUv[1], firstUv[1])];

  // Solves edge = Δu · tangent + Δv · bitangent for both edges: tangent = (Δv₂ · edge₁ − Δv₁ · edge₂) / determinant.
  // Degenerate UVs divide by 1 instead of 0.
  const uvDeterminant = subtract(multiply(firstUvEdge[0], secondUvEdge[1]), multiply(firstUvEdge[1], secondUvEdge[0]));
  const nonZeroDeterminant = uvDeterminant === 0 ? 1 : uvDeterminant;
  const inverseDeterminant = divide(1, nonZeroDeterminant);
  const tangentComponent = (index: 0 | 1 | 2): number => add(multiply(firstEdge[index], secondUvEdge[1]), multiply(secondEdge[index], -firstUvEdge[1]));
  const tangent = scaleVector([tangentComponent(0), tangentComponent(1), tangentComponent(2)], inverseDeterminant);
  return normalizeSafe(negateVector(tangent), [0, 0, 0]);
}

// The bend across the shared edge, in radians: 0 when the triangles lie flat on opposite sides of it, π when one is
// folded onto the other.
export function triangleAngle({
  edgeStart,
  edgeEnd,
  firstApex,
  secondApex,
}: {
  edgeStart: ReadonlyVector3;
  edgeEnd: ReadonlyVector3;
  firstApex: ReadonlyVector3;
  secondApex: ReadonlyVector3;
}): number {
  const edge = subtractVectors(edgeEnd, edgeStart);
  const toFirst = subtractVectors(firstApex, edgeStart);
  const toSecond = subtractVectors(secondApex, edgeStart);
  return angleBetween(cross(toFirst, edge), cross(edge, toSecond));
}

export type SegmentClosestPoints = {
  readonly distanceSquared: number;
  readonly firstRatio: number;
  readonly secondRatio: number;
  readonly firstPoint: Vector3;
  readonly secondPoint: Vector3;
};

export function closestPointsBetweenSegments({
  firstStart,
  firstEnd,
  secondStart,
  secondEnd,
}: {
  firstStart: ReadonlyVector3;
  firstEnd: ReadonlyVector3;
  secondStart: ReadonlyVector3;
  secondEnd: ReadonlyVector3;
}): SegmentClosestPoints {
  const firstDirection = subtractVectors(firstEnd, firstStart);
  const secondDirection = subtractVectors(secondEnd, secondStart);
  const between = subtractVectors(firstStart, secondStart);
  const firstSquared = dot(firstDirection, firstDirection);
  const secondSquared = dot(secondDirection, secondDirection);
  const secondDotBetween = dot(secondDirection, between);
  const { firstRatio, secondRatio } = segmentRatios({ firstDirection, secondDirection, between, firstSquared, secondSquared, secondDotBetween });
  const firstPoint = addVectors(firstStart, scaleVector(firstDirection, firstRatio));
  const secondPoint = addVectors(secondStart, scaleVector(secondDirection, secondRatio));
  const gap = subtractVectors(firstPoint, secondPoint);
  return { distanceSquared: dot(gap, gap), firstRatio, secondRatio, firstPoint, secondPoint };
}

// The ratio along each segment of its closest point (Ericson, Real-Time Collision Detection). The first ratio comes
// from the closest points of the two infinite lines, clamped to [0, 1]; the second is the one closest to that point,
// and when it falls outside [0, 1] it is clamped and the first recomputed for it. A segment whose squared length is at
// most ALMOST_ZERO counts as a point.
function segmentRatios({
  firstDirection,
  secondDirection,
  between,
  firstSquared,
  secondSquared,
  secondDotBetween,
}: {
  firstDirection: ReadonlyVector3;
  secondDirection: ReadonlyVector3;
  between: ReadonlyVector3;
  firstSquared: number;
  secondSquared: number;
  secondDotBetween: number;
}): { firstRatio: number; secondRatio: number } {
  const firstIsPoint = firstSquared <= ALMOST_ZERO;
  const secondIsPoint = secondSquared <= ALMOST_ZERO;
  if (firstIsPoint && secondIsPoint) return { firstRatio: 0, secondRatio: 0 };
  if (firstIsPoint) return { firstRatio: 0, secondRatio: saturate(divide(secondDotBetween, secondSquared)) };
  const firstDotBetween = dot(firstDirection, between);
  if (secondIsPoint) return { firstRatio: saturate(divide(-firstDotBetween, firstSquared)), secondRatio: 0 };

  // The denominator is 0 for parallel segments, where any first ratio is closest; 0 is taken.
  const directionsDot = dot(firstDirection, secondDirection);
  const denominator = subtract(multiply(firstSquared, secondSquared), multiply(directionsDot, directionsDot));
  const firstRatio =
    denominator !== 0 ? saturate(divide(subtract(multiply(directionsDot, secondDotBetween), multiply(firstDotBetween, secondSquared)), denominator)) : 0;
  const secondRatio = divide(add(multiply(directionsDot, firstRatio), secondDotBetween), secondSquared);
  if (secondRatio < 0) return { firstRatio: saturate(divide(-firstDotBetween, firstSquared)), secondRatio: 0 };
  if (secondRatio > 1) return { firstRatio: saturate(divide(subtract(directionsDot, firstDotBetween), firstSquared)), secondRatio: 1 };
  return { firstRatio, secondRatio };
}

export type PlaneDistance = { readonly signedDistance: number; readonly point: Vector3 };
