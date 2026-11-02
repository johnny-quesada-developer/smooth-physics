// lookRotation of quaternion.ts on scalars, with the same Float32 operation order, so both kernel variants stay
// bit-identical with it without allocating. The result is written to LOOK_ROTATION[0..3]. The functions read their
// inputs from arrays: V8 boxes every number passed to a call it does not inline, and these calls are too large to
// inline.
import { fround } from './scalar.ts';

export const LOOK_ROTATION = new Float64Array(4);

// The forward and up axes of rebuildRotationAt.
const AXES = new Float64Array(6);

// lookRotation of the unit forward direction at forwards[forwardOffset..] and the up direction at ups[upOffset..].
export function lookRotationAt(forwards: Float64Array, forwardOffset: number, ups: Float64Array, upOffset: number): void {
  const forwardX = forwards[forwardOffset];
  const forwardY = forwards[forwardOffset + 1];
  const forwardZ = forwards[forwardOffset + 2];
  const upX = ups[upOffset];
  const upY = ups[upOffset + 1];
  const upZ = ups[upOffset + 2];
  // The rotation's columns: the tangent up × forward normalized, the up direction made perpendicular to forward
  // (forward × tangent), and forward.
  const crossX = fround(fround(upY * forwardZ) - fround(upZ * forwardY));
  const crossY = fround(fround(upZ * forwardX) - fround(upX * forwardZ));
  const crossZ = fround(fround(upX * forwardY) - fround(upY * forwardX));
  const inverseCrossLength = fround(1 / fround(Math.sqrt(fround(fround(fround(crossX * crossX) + fround(crossY * crossY)) + fround(crossZ * crossZ)))));
  const tangentX = fround(crossX * inverseCrossLength);
  const tangentY = fround(crossY * inverseCrossLength);
  const tangentZ = fround(crossZ * inverseCrossLength);
  const orthogonalUpX = fround(fround(forwardY * tangentZ) - fround(forwardZ * tangentY));
  const orthogonalUpY = fround(fround(forwardZ * tangentX) - fround(forwardX * tangentZ));
  const orthogonalUpZ = fround(fround(forwardX * tangentY) - fround(forwardY * tangentX));

  // rotationFromColumns with columnU = tangent, columnV = orthogonal up and columnW = forward.
  const firstDiagonalIsNegative = Object.is(tangentX, -0) || tangentX < 0;
  const trace = fround(orthogonalUpY + (firstDiagonalIsNegative ? -forwardZ : forwardZ));
  const traceIsNegative = Object.is(trace, -0) || trace < 0;
  const diagonal = fround(1 + Math.abs(tangentX));
  const firstDiagonalSign = firstDiagonalIsNegative ? -1 : 1;
  const traceSign = traceIsNegative ? -1 : 1;
  const unordered0 = fround(diagonal + traceSign * trace);
  const unordered1 = fround(tangentY + -firstDiagonalSign * traceSign * orthogonalUpX);
  const unordered2 = fround(forwardX + -traceSign * tangentZ);
  const unordered3 = fround(orthogonalUpZ + -firstDiagonalSign * forwardY);

  // swapped = first diagonal negative ? (unordered2, unordered3, unordered0, unordered1) : unordered;
  // ordered = trace negative ? swapped : reversed(swapped). The ordered components start as swapped.
  let orderedX = firstDiagonalIsNegative ? unordered2 : unordered0;
  let orderedY = firstDiagonalIsNegative ? unordered3 : unordered1;
  let orderedZ = firstDiagonalIsNegative ? unordered0 : unordered2;
  let orderedW = firstDiagonalIsNegative ? unordered1 : unordered3;
  if (!traceIsNegative) {
    const swappedW = orderedW;
    const swappedZ = orderedZ;
    orderedW = orderedX;
    orderedZ = orderedY;
    orderedX = swappedW;
    orderedY = swappedZ;
  }

  const inverseLength = fround(
    1 /
      fround(
        Math.sqrt(
          fround(fround(fround(fround(orderedX * orderedX) + fround(orderedY * orderedY)) + fround(orderedZ * orderedZ)) + fround(orderedW * orderedW)),
        ),
      ),
  );
  LOOK_ROTATION[0] = fround(inverseLength * orderedX);
  LOOK_ROTATION[1] = fround(inverseLength * orderedY);
  LOOK_ROTATION[2] = fround(inverseLength * orderedZ);
  LOOK_ROTATION[3] = fround(inverseLength * orderedW);
}

// lookRotation(columns[2], columns[1]) of the rotationColumns of the quaternion at rotations[offset..], which rebuilds
// the rotation from its forward and up axes.
export function rebuildRotationAt(rotations: Float64Array, offset: number): void {
  const x = rotations[offset];
  const y = rotations[offset + 1];
  const z = rotations[offset + 2];
  const w = rotations[offset + 3];
  const twiceX = fround(x + x);
  const twiceY = fround(y + y);
  const twiceZ = fround(z + z);
  AXES[0] = fround(fround(fround(twiceX * z) - fround(twiceY * -w)) + 0);
  AXES[1] = fround(fround(fround(twiceX * -w) - fround(twiceY * -z)) + 0);
  AXES[2] = fround(fround(fround(twiceX * -x) - fround(twiceY * y)) + 1);
  AXES[3] = fround(fround(fround(twiceZ * -w) - fround(twiceX * -y)) + 0);
  AXES[4] = fround(fround(fround(twiceZ * -z) - fround(twiceX * x)) + 1);
  AXES[5] = fround(fround(fround(twiceZ * y) - fround(twiceX * -w)) + 0);
  lookRotationAt(AXES, 0, AXES, 3);
}
