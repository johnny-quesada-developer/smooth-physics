import { add, cosine, divide, fround, inverseSquareRoot, multiply, sine, subtract } from './scalar.ts';
import { addVectors, cross, normalize, scaleVector, type ReadonlyVector3, type Vector3 } from './vector.ts';

export type Quaternion = [x: number, y: number, z: number, w: number];
export type ReadonlyQuaternion = readonly [x: number, y: number, z: number, w: number];
export type Matrix3Columns = [column0: Vector3, column1: Vector3, column2: Vector3];

export const dotQuaternions = (left: ReadonlyQuaternion, right: ReadonlyQuaternion): number =>
  add(add(add(multiply(left[0], right[0]), multiply(left[1], right[1])), multiply(left[2], right[2])), multiply(left[3], right[3]));

export const multiplyQuaternions = (left: ReadonlyQuaternion, right: ReadonlyQuaternion): Quaternion => [
  subtract(add(multiply(left[3], right[0]), add(multiply(left[0], right[3]), multiply(left[1], right[2]))), multiply(left[2], right[1])),
  subtract(add(multiply(left[3], right[1]), add(multiply(left[1], right[3]), multiply(left[2], right[0]))), multiply(left[0], right[2])),
  subtract(add(multiply(left[3], right[2]), add(multiply(left[2], right[3]), multiply(left[0], right[1]))), multiply(left[1], right[0])),
  subtract(add(multiply(left[3], right[3]), -add(multiply(left[0], right[0]), multiply(left[1], right[1]))), multiply(left[2], right[2])),
];

export function rotateVector(rotation: ReadonlyQuaternion, value: ReadonlyVector3): Vector3 {
  const axis: Vector3 = [rotation[0], rotation[1], rotation[2]];
  const twiceCross = scaleVector(cross(axis, value), 2);
  return addVectors(addVectors(value, scaleVector(twiceCross, rotation[3])), cross(axis, twiceCross));
}

// multiplyQuaternions and rotateVector on flat arrays, in the same operation order, for per-frame callers: they read
// their inputs at the offsets and write the result to output at outputOffset, allocating nothing. Inputs and output
// may overlap.
export function multiplyQuaternionsInto(
  left: Float64Array,
  leftOffset: number,
  right: Float64Array,
  rightOffset: number,
  output: Float64Array,
  outputOffset: number,
): void {
  const leftX = left[leftOffset];
  const leftY = left[leftOffset + 1];
  const leftZ = left[leftOffset + 2];
  const leftW = left[leftOffset + 3];
  const rightX = right[rightOffset];
  const rightY = right[rightOffset + 1];
  const rightZ = right[rightOffset + 2];
  const rightW = right[rightOffset + 3];
  output[outputOffset] = fround(fround(fround(leftW * rightX) + fround(fround(leftX * rightW) + fround(leftY * rightZ))) - fround(leftZ * rightY));
  output[outputOffset + 1] = fround(fround(fround(leftW * rightY) + fround(fround(leftY * rightW) + fround(leftZ * rightX))) - fround(leftX * rightZ));
  output[outputOffset + 2] = fround(fround(fround(leftW * rightZ) + fround(fround(leftZ * rightW) + fround(leftX * rightY))) - fround(leftY * rightX));
  output[outputOffset + 3] = fround(fround(fround(leftW * rightW) + -fround(fround(leftX * rightX) + fround(leftY * rightY))) - fround(leftZ * rightZ));
}

export function rotateVectorInto(
  rotations: Float64Array,
  rotationOffset: number,
  vectors: Float64Array,
  vectorOffset: number,
  output: Float64Array,
  outputOffset: number,
): void {
  const rotationX = rotations[rotationOffset];
  const rotationY = rotations[rotationOffset + 1];
  const rotationZ = rotations[rotationOffset + 2];
  const rotationW = rotations[rotationOffset + 3];
  const vectorX = vectors[vectorOffset];
  const vectorY = vectors[vectorOffset + 1];
  const vectorZ = vectors[vectorOffset + 2];
  const twiceCrossX = fround(fround(fround(rotationY * vectorZ) - fround(rotationZ * vectorY)) * 2);
  const twiceCrossY = fround(fround(fround(rotationZ * vectorX) - fround(rotationX * vectorZ)) * 2);
  const twiceCrossZ = fround(fround(fround(rotationX * vectorY) - fround(rotationY * vectorX)) * 2);
  output[outputOffset] = fround(fround(vectorX + fround(twiceCrossX * rotationW)) + fround(fround(rotationY * twiceCrossZ) - fround(rotationZ * twiceCrossY)));
  output[outputOffset + 1] = fround(
    fround(vectorY + fround(twiceCrossY * rotationW)) + fround(fround(rotationZ * twiceCrossX) - fround(rotationX * twiceCrossZ)),
  );
  output[outputOffset + 2] = fround(
    fround(vectorZ + fround(twiceCrossZ * rotationW)) + fround(fround(rotationX * twiceCrossY) - fround(rotationY * twiceCrossX)),
  );
}

// Quaternion inversion, normalization and spherical interpolation on flat arrays, likewise. The amount of
// sphericalInterpolationInto is read from amounts[amountOffset]: V8 boxes a number passed to a call it does not inline.
export function invertQuaternionInto(values: Float64Array, offset: number, output: Float64Array, outputOffset: number): void {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const inverseLengthSquared = fround(1 / fround(fround(fround(fround(x * x) + fround(y * y)) + fround(z * z)) + fround(w * w)));
  output[outputOffset] = -fround(inverseLengthSquared * x);
  output[outputOffset + 1] = -fround(inverseLengthSquared * y);
  output[outputOffset + 2] = -fround(inverseLengthSquared * z);
  output[outputOffset + 3] = fround(inverseLengthSquared * w);
}

export function normalizeQuaternionInto(values: Float64Array, offset: number, output: Float64Array, outputOffset: number): void {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const inverseLength = fround(1 / fround(Math.sqrt(fround(fround(fround(fround(x * x) + fround(y * y)) + fround(z * z)) + fround(w * w)))));
  output[outputOffset] = fround(inverseLength * x);
  output[outputOffset + 1] = fround(inverseLength * y);
  output[outputOffset + 2] = fround(inverseLength * z);
  output[outputOffset + 3] = fround(inverseLength * w);
}

export function sphericalInterpolationInto(
  from: Float64Array,
  fromOffset: number,
  to: Float64Array,
  toOffset: number,
  amounts: Float64Array,
  amountOffset: number,
  output: Float64Array,
  outputOffset: number,
): void {
  const fromX = from[fromOffset];
  const fromY = from[fromOffset + 1];
  const fromZ = from[fromOffset + 2];
  const fromW = from[fromOffset + 3];
  let targetX = to[toOffset];
  let targetY = to[toOffset + 1];
  let targetZ = to[toOffset + 2];
  let targetW = to[toOffset + 3];
  const amount = amounts[amountOffset];
  const signedCosine = fround(fround(fround(fround(fromX * targetX) + fround(fromY * targetY)) + fround(fromZ * targetZ)) + fround(fromW * targetW));
  const flipped = signedCosine < 0;
  const cosineAngle = flipped ? -signedCosine : signedCosine;
  if (flipped) {
    targetX = -targetX;
    targetY = -targetY;
    targetZ = -targetZ;
    targetW = -targetW;
  }

  if (cosineAngle >= fround(0.9995)) {
    // Nearly equal rotations: the sine of the angle approaches 0, so interpolate linearly and normalize instead.
    if (fround(fround(fround(fround(fromX * targetX) + fround(fromY * targetY)) + fround(fromZ * targetZ)) + fround(fromW * targetW)) < 0) {
      targetX = -targetX;
      targetY = -targetY;
      targetZ = -targetZ;
      targetW = -targetW;
    }
    const x = fround(fromX + fround(amount * fround(targetX - fromX)));
    const y = fround(fromY + fround(amount * fround(targetY - fromY)));
    const z = fround(fromZ + fround(amount * fround(targetZ - fromZ)));
    const w = fround(fromW + fround(amount * fround(targetW - fromW)));
    const inverseLength = fround(1 / fround(Math.sqrt(fround(fround(fround(fround(x * x) + fround(y * y)) + fround(z * z)) + fround(w * w)))));
    output[outputOffset] = fround(inverseLength * x);
    output[outputOffset + 1] = fround(inverseLength * y);
    output[outputOffset + 2] = fround(inverseLength * z);
    output[outputOffset + 3] = fround(inverseLength * w);
    return;
  }

  const angle = fround(Math.acos(cosineAngle));
  const inverseSine = fround(1 / fround(Math.sqrt(fround(1 - fround(cosineAngle * cosineAngle)))));
  const fromWeight = fround(fround(Math.sin(fround(angle * fround(1 - amount)))) * inverseSine);
  const toWeight = fround(fround(Math.sin(fround(angle * amount))) * inverseSine);
  output[outputOffset] = fround(fround(fromX * fromWeight) + fround(targetX * toWeight));
  output[outputOffset + 1] = fround(fround(fromY * fromWeight) + fround(targetY * toWeight));
  output[outputOffset + 2] = fround(fround(fromZ * fromWeight) + fround(targetZ * toWeight));
  output[outputOffset + 3] = fround(fround(fromW * fromWeight) + fround(targetW * toWeight));
}

export function invertQuaternion(value: ReadonlyQuaternion): Quaternion {
  const inverseLengthSquared = divide(1, dotQuaternions(value, value));
  return [
    -multiply(inverseLengthSquared, value[0]),
    -multiply(inverseLengthSquared, value[1]),
    -multiply(inverseLengthSquared, value[2]),
    multiply(inverseLengthSquared, value[3]),
  ];
}

export function normalizeQuaternion(value: ReadonlyQuaternion): Quaternion {
  const inverseLength = inverseSquareRoot(dotQuaternions(value, value));
  return [multiply(inverseLength, value[0]), multiply(inverseLength, value[1]), multiply(inverseLength, value[2]), multiply(inverseLength, value[3])];
}

// The axis must be unit length.
export function axisAngle(axis: ReadonlyVector3, angle: number): Quaternion {
  const halfAngle = multiply(0.5, angle);
  const halfAngleSine = sine(halfAngle);
  const halfAngleCosine = cosine(halfAngle);
  return [multiply(axis[0], halfAngleSine), multiply(axis[1], halfAngleSine), multiply(axis[2], halfAngleSine), halfAngleCosine];
}

export function rotationColumns(rotation: ReadonlyQuaternion): Matrix3Columns {
  const [x, y, z, w] = rotation;
  const twiceX = add(x, x);
  const twiceY = add(y, y);
  const twiceZ = add(z, z);
  return [
    [
      add(subtract(multiply(twiceY, -y), multiply(twiceZ, z)), 1),
      add(subtract(multiply(twiceY, x), multiply(twiceZ, -w)), 0),
      add(subtract(multiply(twiceY, -w), multiply(twiceZ, -x)), 0),
    ],
    [
      add(subtract(multiply(twiceZ, -w), multiply(twiceX, -y)), 0),
      add(subtract(multiply(twiceZ, -z), multiply(twiceX, x)), 1),
      add(subtract(multiply(twiceZ, y), multiply(twiceX, -w)), 0),
    ],
    [
      add(subtract(multiply(twiceX, z), multiply(twiceY, -w)), 0),
      add(subtract(multiply(twiceX, -w), multiply(twiceY, -z)), 0),
      add(subtract(multiply(twiceX, -x), multiply(twiceY, y)), 1),
    ],
  ];
}

// The rotation of the matrix with these columns. The signs of the first diagonal entry and of trace (the sum or
// difference of the other two) pick one of the four standard conversion cases, so the component derived from the
// diagonal, 1 + |first diagonal| + |trace|, is at least 1 and the normalization stays stable. -0 counts as negative.
export function rotationFromColumns(columnU: ReadonlyVector3, columnV: ReadonlyVector3, columnW: ReadonlyVector3): Quaternion {
  const firstDiagonalIsNegative = Object.is(columnU[0], -0) || columnU[0] < 0;
  const trace = add(columnV[1], firstDiagonalIsNegative ? -columnW[2] : columnW[2]);
  const traceIsNegative = Object.is(trace, -0) || trace < 0;
  const diagonal = add(1, Math.abs(columnU[0]));

  // sign flips = (0,-,-,-) ^ (first diagonal negative ? (0,-,0,-) : 0) ^ (trace negative ? (-,-,-,0) : 0)
  const firstDiagonalSign = firstDiagonalIsNegative ? -1 : 1;
  const traceSign = traceIsNegative ? -1 : 1;
  const signs: readonly [number, number, number, number] = [traceSign, -firstDiagonalSign * traceSign, -traceSign, -firstDiagonalSign];
  const unordered: Quaternion = [
    add(diagonal, signs[0] * trace),
    add(columnU[1], signs[1] * columnV[0]),
    add(columnW[0], signs[2] * columnU[2]),
    add(columnV[2], signs[3] * columnW[1]),
  ];

  const swapped: Quaternion = firstDiagonalIsNegative ? [unordered[2], unordered[3], unordered[0], unordered[1]] : unordered;
  const ordered: Quaternion = traceIsNegative ? swapped : [swapped[3], swapped[2], swapped[1], swapped[0]];
  return normalizeQuaternion(ordered);
}

// The rotation that turns +Z to the unit forward direction and +Y toward up. look-rotation.ts repeats it on scalars
// in the same operation order; change both together.
export function lookRotation(forward: ReadonlyVector3, up: ReadonlyVector3): Quaternion {
  const tangent = normalize(cross(up, forward));
  return rotationFromColumns(tangent, cross(forward, tangent), forward);
}
