// 4×4 matrices as 16 numbers in column-major order: the entry of a column and row is at column * 4 + row.
import { add, divide, fround, multiply } from './scalar.ts';
import { length, normalize, scaleVector, type ReadonlyVector3, type Vector3 } from './vector.ts';
import { rotationColumns, type ReadonlyQuaternion } from './quaternion.ts';

export type Matrix4 = number[];
export type ReadonlyMatrix4 = readonly number[];

export function composeMatrix(translation: ReadonlyVector3, rotation: ReadonlyQuaternion, scale: ReadonlyVector3): Matrix4 {
  const [column0, column1, column2] = rotationColumns(rotation);
  return [
    multiply(column0[0], scale[0]),
    multiply(column0[1], scale[0]),
    multiply(column0[2], scale[0]),
    0,
    multiply(column1[0], scale[1]),
    multiply(column1[1], scale[1]),
    multiply(column1[2], scale[1]),
    0,
    multiply(column2[0], scale[2]),
    multiply(column2[1], scale[2]),
    multiply(column2[2], scale[2]),
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

const entry = (matrix: ReadonlyMatrix4, index: number): number => matrix[index];

export function transformPoint(matrix: ReadonlyMatrix4, point: ReadonlyVector3): Vector3 {
  const resultComponent = (index: number): number =>
    add(
      add(add(multiply(entry(matrix, index), point[0]), multiply(entry(matrix, 4 + index), point[1])), multiply(entry(matrix, 8 + index), point[2])),
      entry(matrix, 12 + index),
    );
  return [resultComponent(0), resultComponent(1), resultComponent(2)];
}

export function transformVector(matrix: ReadonlyMatrix4, value: ReadonlyVector3): Vector3 {
  const resultComponent = (index: number): number =>
    add(add(multiply(entry(matrix, index), value[0]), multiply(entry(matrix, 4 + index), value[1])), multiply(entry(matrix, 8 + index), value[2]));
  return [resultComponent(0), resultComponent(1), resultComponent(2)];
}

// The transformed direction scaled back to the original length. A zero direction is copied, since normalizing it would
// give NaN.
export function transformDirection(matrix: ReadonlyMatrix4, direction: ReadonlyVector3): Vector3 {
  const directionLength = length(direction);
  return directionLength > 0 ? scaleVector(normalize(transformVector(matrix, direction)), directionLength) : [direction[0], direction[1], direction[2]];
}

export function multiplyMatrices(left: ReadonlyMatrix4, right: ReadonlyMatrix4): Matrix4 {
  // A literal, not Array.from: this runs for every pose read and Array.from costs several times more.
  const product: Matrix4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      product[column * 4 + row] = add(
        add(
          add(multiply(entry(left, row), entry(right, column * 4)), multiply(entry(left, 4 + row), entry(right, column * 4 + 1))),
          multiply(entry(left, 8 + row), entry(right, column * 4 + 2)),
        ),
        multiply(entry(left, 12 + row), entry(right, column * 4 + 3)),
      );
    }
  }
  return product;
}

// General inverse computed in double precision and rounded once per element. The entries start as the adjugate (the
// transposed cofactor matrix), and the determinant is its expansion along the first column.
export function invertMatrix(matrix: ReadonlyMatrix4): Matrix4 {
  const element = (index: number): number => entry(matrix, index);
  const inverse: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  inverse[0] =
    element(5) * element(10) * element(15) -
    element(5) * element(11) * element(14) -
    element(9) * element(6) * element(15) +
    element(9) * element(7) * element(14) +
    element(13) * element(6) * element(11) -
    element(13) * element(7) * element(10);
  inverse[4] =
    -element(4) * element(10) * element(15) +
    element(4) * element(11) * element(14) +
    element(8) * element(6) * element(15) -
    element(8) * element(7) * element(14) -
    element(12) * element(6) * element(11) +
    element(12) * element(7) * element(10);
  inverse[8] =
    element(4) * element(9) * element(15) -
    element(4) * element(11) * element(13) -
    element(8) * element(5) * element(15) +
    element(8) * element(7) * element(13) +
    element(12) * element(5) * element(11) -
    element(12) * element(7) * element(9);
  inverse[12] =
    -element(4) * element(9) * element(14) +
    element(4) * element(10) * element(13) +
    element(8) * element(5) * element(14) -
    element(8) * element(6) * element(13) -
    element(12) * element(5) * element(10) +
    element(12) * element(6) * element(9);

  inverse[1] =
    -element(1) * element(10) * element(15) +
    element(1) * element(11) * element(14) +
    element(9) * element(2) * element(15) -
    element(9) * element(3) * element(14) -
    element(13) * element(2) * element(11) +
    element(13) * element(3) * element(10);
  inverse[5] =
    element(0) * element(10) * element(15) -
    element(0) * element(11) * element(14) -
    element(8) * element(2) * element(15) +
    element(8) * element(3) * element(14) +
    element(12) * element(2) * element(11) -
    element(12) * element(3) * element(10);
  inverse[9] =
    -element(0) * element(9) * element(15) +
    element(0) * element(11) * element(13) +
    element(8) * element(1) * element(15) -
    element(8) * element(3) * element(13) -
    element(12) * element(1) * element(11) +
    element(12) * element(3) * element(9);
  inverse[13] =
    element(0) * element(9) * element(14) -
    element(0) * element(10) * element(13) -
    element(8) * element(1) * element(14) +
    element(8) * element(2) * element(13) +
    element(12) * element(1) * element(10) -
    element(12) * element(2) * element(9);

  inverse[2] =
    element(1) * element(6) * element(15) -
    element(1) * element(7) * element(14) -
    element(5) * element(2) * element(15) +
    element(5) * element(3) * element(14) +
    element(13) * element(2) * element(7) -
    element(13) * element(3) * element(6);
  inverse[6] =
    -element(0) * element(6) * element(15) +
    element(0) * element(7) * element(14) +
    element(4) * element(2) * element(15) -
    element(4) * element(3) * element(14) -
    element(12) * element(2) * element(7) +
    element(12) * element(3) * element(6);
  inverse[10] =
    element(0) * element(5) * element(15) -
    element(0) * element(7) * element(13) -
    element(4) * element(1) * element(15) +
    element(4) * element(3) * element(13) +
    element(12) * element(1) * element(7) -
    element(12) * element(3) * element(5);
  inverse[14] =
    -element(0) * element(5) * element(14) +
    element(0) * element(6) * element(13) +
    element(4) * element(1) * element(14) -
    element(4) * element(2) * element(13) -
    element(12) * element(1) * element(6) +
    element(12) * element(2) * element(5);

  inverse[3] =
    -element(1) * element(6) * element(11) +
    element(1) * element(7) * element(10) +
    element(5) * element(2) * element(11) -
    element(5) * element(3) * element(10) -
    element(9) * element(2) * element(7) +
    element(9) * element(3) * element(6);
  inverse[7] =
    element(0) * element(6) * element(11) -
    element(0) * element(7) * element(10) -
    element(4) * element(2) * element(11) +
    element(4) * element(3) * element(10) +
    element(8) * element(2) * element(7) -
    element(8) * element(3) * element(6);
  inverse[11] =
    -element(0) * element(5) * element(11) +
    element(0) * element(7) * element(9) +
    element(4) * element(1) * element(11) -
    element(4) * element(3) * element(9) -
    element(8) * element(1) * element(7) +
    element(8) * element(3) * element(5);
  inverse[15] =
    element(0) * element(5) * element(10) -
    element(0) * element(6) * element(9) -
    element(4) * element(1) * element(10) +
    element(4) * element(2) * element(9) +
    element(8) * element(1) * element(6) -
    element(8) * element(2) * element(5);

  const determinant = element(0) * entry(inverse, 0) + element(1) * entry(inverse, 4) + element(2) * entry(inverse, 8) + element(3) * entry(inverse, 12);
  return inverse.map((value) => divide(value, determinant));
}

export const toFloat32Matrix = (values: readonly number[]): Matrix4 => values.map((value) => fround(value));
