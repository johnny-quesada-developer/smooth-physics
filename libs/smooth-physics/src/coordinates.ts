// The solver works left-handed with Y up. Other coordinate systems differ from it only by which axis is which and
// by sign, so converting moves and negates numbers and never rounds: results are exact in both directions.
import { fround } from './float32/scalar.ts';
import type { Matrix4 } from './float32/matrix.ts';
import type { Quaternion } from './float32/quaternion.ts';
import type { Vector3 } from './float32/vector.ts';
import type { Pose, PoseSource } from './cloth-state.ts';

export type Coordinates = { readonly up: 'y' | 'z'; readonly handedness: 'left' | 'right' };
export type Axis = 'x' | 'y' | 'z';
export type SignedAxis = Axis | '-x' | '-y' | '-z';

export const SOLVER_COORDINATES: Coordinates = { up: 'y', handedness: 'left' };

type Triplet = readonly [number, number, number];
type Quadruplet = readonly [number, number, number, number];
// Solver component k is sign[k] times user component from[k]. Right-handed with Y up mirrors X, as three.js and glTF
// need. With Z up the user's Z becomes the solver's Y; left-handed Z up (X forward, Y right) also turns X and Y.
const MAPS: Readonly<Record<`${Coordinates['up']}-${Coordinates['handedness']}`, { readonly from: Triplet; readonly sign: Triplet }>> = {
  'y-left': { from: [0, 1, 2], sign: [1, 1, 1] },
  'y-right': { from: [0, 1, 2], sign: [-1, 1, 1] },
  'z-left': { from: [1, 2, 0], sign: [1, 1, 1] },
  'z-right': { from: [0, 2, 1], sign: [1, 1, 1] },
};
const AXES: readonly Axis[] = ['x', 'y', 'z'];
type MapName = keyof typeof MAPS;

// The per-frame conversions, written out for each map so every index and sign is a constant: the general methods
// below look them up and cost measurably more per bone. coordinates.test.ts checks these against those methods.
export type FrameKernels = {
  // To the solver, rounded to Float32, into out, or into a new array without it. Per-frame callers pass out.
  readonly matrix: (matrix: ArrayLike<number>, out?: Matrix4) => Matrix4;
  readonly position: (position: Triplet, out?: Vector3) => Vector3;
  readonly rotation: (rotation: Quadruplet, out?: Quaternion) => Quaternion;
  readonly scale: (scale: Triplet, out?: Vector3) => Vector3;
  // Back to the caller's coordinates, exactly, into out. The value starts at source[at], so a flat particle buffer
  // is read in place.
  readonly vectorToUser: (source: ArrayLike<number>, at: number, out: Vector3) => Vector3;
  readonly rotationToUser: (source: ArrayLike<number>, at: number, out: Quaternion) => Quaternion;
};

// NaN makes V8 store the elements as doubles from the start, the kind that the converted values need.
export const unsetMatrix = (): Matrix4 => [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
export const unsetVector = (): Vector3 => [NaN, NaN, NaN];
export const unsetQuaternion = (): Quaternion => [NaN, NaN, NaN, NaN];

const toFloat32 = fround;
export const FRAME_KERNELS: Readonly<Record<MapName, FrameKernels>> = {
  'y-left': {
    matrix: (matrix, out = unsetMatrix()) => {
      out[0] = toFloat32(matrix[0]);
      out[1] = toFloat32(matrix[1]);
      out[2] = toFloat32(matrix[2]);
      out[3] = toFloat32(matrix[3]);
      out[4] = toFloat32(matrix[4]);
      out[5] = toFloat32(matrix[5]);
      out[6] = toFloat32(matrix[6]);
      out[7] = toFloat32(matrix[7]);
      out[8] = toFloat32(matrix[8]);
      out[9] = toFloat32(matrix[9]);
      out[10] = toFloat32(matrix[10]);
      out[11] = toFloat32(matrix[11]);
      out[12] = toFloat32(matrix[12]);
      out[13] = toFloat32(matrix[13]);
      out[14] = toFloat32(matrix[14]);
      out[15] = toFloat32(matrix[15]);
      return out;
    },
    position: (position, out = unsetVector()) => ((out[0] = toFloat32(position[0])), (out[1] = toFloat32(position[1])), (out[2] = toFloat32(position[2])), out),
    rotation: (rotation, out = unsetQuaternion()) => (
      (out[0] = toFloat32(rotation[0])),
      (out[1] = toFloat32(rotation[1])),
      (out[2] = toFloat32(rotation[2])),
      (out[3] = toFloat32(rotation[3])),
      out
    ),
    scale: (scale, out = unsetVector()) => ((out[0] = toFloat32(scale[0])), (out[1] = toFloat32(scale[1])), (out[2] = toFloat32(scale[2])), out),
    vectorToUser: (source, at, out) => ((out[0] = source[at]), (out[1] = source[at + 1]), (out[2] = source[at + 2]), out),
    rotationToUser: (source, at, out) => ((out[0] = source[at]), (out[1] = source[at + 1]), (out[2] = source[at + 2]), (out[3] = source[at + 3]), out),
  },
  'y-right': {
    matrix: (matrix, out = unsetMatrix()) => {
      out[0] = toFloat32(matrix[0]);
      out[1] = toFloat32(-matrix[1]);
      out[2] = toFloat32(-matrix[2]);
      out[3] = toFloat32(-matrix[3]);
      out[4] = toFloat32(-matrix[4]);
      out[5] = toFloat32(matrix[5]);
      out[6] = toFloat32(matrix[6]);
      out[7] = toFloat32(matrix[7]);
      out[8] = toFloat32(-matrix[8]);
      out[9] = toFloat32(matrix[9]);
      out[10] = toFloat32(matrix[10]);
      out[11] = toFloat32(matrix[11]);
      out[12] = toFloat32(-matrix[12]);
      out[13] = toFloat32(matrix[13]);
      out[14] = toFloat32(matrix[14]);
      out[15] = toFloat32(matrix[15]);
      return out;
    },
    position: (position, out = unsetVector()) => (
      (out[0] = toFloat32(-position[0])),
      (out[1] = toFloat32(position[1])),
      (out[2] = toFloat32(position[2])),
      out
    ),
    rotation: (rotation, out = unsetQuaternion()) => (
      (out[0] = toFloat32(rotation[0])),
      (out[1] = toFloat32(-rotation[1])),
      (out[2] = toFloat32(-rotation[2])),
      (out[3] = toFloat32(rotation[3])),
      out
    ),
    scale: (scale, out = unsetVector()) => ((out[0] = toFloat32(scale[0])), (out[1] = toFloat32(scale[1])), (out[2] = toFloat32(scale[2])), out),
    vectorToUser: (source, at, out) => ((out[0] = -source[at]), (out[1] = source[at + 1]), (out[2] = source[at + 2]), out),
    rotationToUser: (source, at, out) => ((out[0] = source[at]), (out[1] = -source[at + 1]), (out[2] = -source[at + 2]), (out[3] = source[at + 3]), out),
  },
  'z-left': {
    matrix: (matrix, out = unsetMatrix()) => {
      out[0] = toFloat32(matrix[5]);
      out[1] = toFloat32(matrix[6]);
      out[2] = toFloat32(matrix[4]);
      out[3] = toFloat32(matrix[7]);
      out[4] = toFloat32(matrix[9]);
      out[5] = toFloat32(matrix[10]);
      out[6] = toFloat32(matrix[8]);
      out[7] = toFloat32(matrix[11]);
      out[8] = toFloat32(matrix[1]);
      out[9] = toFloat32(matrix[2]);
      out[10] = toFloat32(matrix[0]);
      out[11] = toFloat32(matrix[3]);
      out[12] = toFloat32(matrix[13]);
      out[13] = toFloat32(matrix[14]);
      out[14] = toFloat32(matrix[12]);
      out[15] = toFloat32(matrix[15]);
      return out;
    },
    position: (position, out = unsetVector()) => ((out[0] = toFloat32(position[1])), (out[1] = toFloat32(position[2])), (out[2] = toFloat32(position[0])), out),
    rotation: (rotation, out = unsetQuaternion()) => (
      (out[0] = toFloat32(rotation[1])),
      (out[1] = toFloat32(rotation[2])),
      (out[2] = toFloat32(rotation[0])),
      (out[3] = toFloat32(rotation[3])),
      out
    ),
    scale: (scale, out = unsetVector()) => ((out[0] = toFloat32(scale[1])), (out[1] = toFloat32(scale[2])), (out[2] = toFloat32(scale[0])), out),
    vectorToUser: (source, at, out) => ((out[0] = source[at + 2]), (out[1] = source[at]), (out[2] = source[at + 1]), out),
    rotationToUser: (source, at, out) => ((out[0] = source[at + 2]), (out[1] = source[at]), (out[2] = source[at + 1]), (out[3] = source[at + 3]), out),
  },
  'z-right': {
    matrix: (matrix, out = unsetMatrix()) => {
      out[0] = toFloat32(matrix[0]);
      out[1] = toFloat32(matrix[2]);
      out[2] = toFloat32(matrix[1]);
      out[3] = toFloat32(matrix[3]);
      out[4] = toFloat32(matrix[8]);
      out[5] = toFloat32(matrix[10]);
      out[6] = toFloat32(matrix[9]);
      out[7] = toFloat32(matrix[11]);
      out[8] = toFloat32(matrix[4]);
      out[9] = toFloat32(matrix[6]);
      out[10] = toFloat32(matrix[5]);
      out[11] = toFloat32(matrix[7]);
      out[12] = toFloat32(matrix[12]);
      out[13] = toFloat32(matrix[14]);
      out[14] = toFloat32(matrix[13]);
      out[15] = toFloat32(matrix[15]);
      return out;
    },
    position: (position, out = unsetVector()) => ((out[0] = toFloat32(position[0])), (out[1] = toFloat32(position[2])), (out[2] = toFloat32(position[1])), out),
    rotation: (rotation, out = unsetQuaternion()) => (
      (out[0] = toFloat32(-rotation[0])),
      (out[1] = toFloat32(-rotation[2])),
      (out[2] = toFloat32(-rotation[1])),
      (out[3] = toFloat32(rotation[3])),
      out
    ),
    scale: (scale, out = unsetVector()) => ((out[0] = toFloat32(scale[0])), (out[1] = toFloat32(scale[2])), (out[2] = toFloat32(scale[1])), out),
    vectorToUser: (source, at, out) => ((out[0] = source[at]), (out[1] = source[at + 2]), (out[2] = source[at + 1]), out),
    rotationToUser: (source, at, out) => ((out[0] = -source[at]), (out[1] = -source[at + 2]), (out[2] = -source[at + 1]), (out[3] = source[at + 3]), out),
  },
};

export class Axes {
  readonly coordinates: Coordinates;
  // True for the solver's own coordinates: nothing is converted.
  readonly native: boolean;
  readonly from: Triplet;
  readonly sign: Triplet;
  // to[j] is the solver component that user component j becomes.
  readonly to: Triplet;
  // A rotation's axis is a cross product, so a mirror negates it once more.
  readonly rotationSign: Triplet;
  readonly matrixFrom: readonly number[];
  readonly matrixSign: readonly number[];
  readonly kernels: FrameKernels;

  constructor(coordinates: Coordinates) {
    const name: MapName = `${coordinates.up}-${coordinates.handedness}`;
    const { from, sign } = MAPS[name];
    this.coordinates = coordinates;
    this.kernels = FRAME_KERNELS[name];
    this.from = from;
    this.sign = sign;
    this.to = [from.indexOf(0), from.indexOf(1), from.indexOf(2)];

    // The map's determinant: the product of the signs, negated when from swaps two axes. It is -1 for a mirror.
    const evenOrder = from[0] === 0 ? from[1] === 1 : from[1] === (from[0] + 1) % 3;
    const determinant = sign[0] * sign[1] * sign[2] * (evenOrder ? 1 : -1);
    this.rotationSign = [determinant * sign[0], determinant * sign[1], determinant * sign[2]];
    this.native = from[0] === 0 && from[1] === 1 && sign[0] === 1 && sign[1] === 1 && sign[2] === 1;

    // Column-major: element column * 4 + row; the fourth row and column keep their place and sign.
    const sourceIndex = (index: number): number => (index === 3 ? 3 : (from[index] ?? index));
    const signOf = (index: number): number => (index === 3 ? 1 : (sign[index] ?? 1));
    this.matrixFrom = Array.from({ length: 16 }, (_, element) => sourceIndex(Math.trunc(element / 4)) * 4 + sourceIndex(element % 4));
    this.matrixSign = Array.from({ length: 16 }, (_, element) => signOf(Math.trunc(element / 4)) * signOf(element % 4));
  }

  vectorToSolver(value: Triplet): Vector3 {
    const { from, sign } = this;
    return [sign[0] * value[from[0]], sign[1] * value[from[1]], sign[2] * value[from[2]]];
  }

  rotationToSolver(value: Quadruplet): Quaternion {
    const { from, rotationSign: sign } = this;
    return [sign[0] * value[from[0]], sign[1] * value[from[1]], sign[2] * value[from[2]], value[3]];
  }

  scaleToSolver(value: Triplet): Vector3 {
    const { from } = this;
    return [value[from[0]], value[from[1]], value[from[2]]];
  }

  // A bone's local axis keeps pointing the same way in both spaces.
  axisToSolver(axis: SignedAxis): SignedAxis {
    const negative = axis.startsWith('-');
    const userIndex = AXES.indexOf(axisNamed(negative ? axis.slice(1) : axis));
    const solverIndex = this.to[userIndex] ?? userIndex;
    const solverAxis = AXES[solverIndex] ?? 'y';
    return (this.sign[solverIndex] ?? 1) * (negative ? -1 : 1) < 0 ? negated(solverAxis) : solverAxis;
  }

  vectorToUser(value: Triplet, out: Vector3): Vector3 {
    const { to, sign } = this;
    out[0] = sign[to[0]] * value[to[0]];
    out[1] = sign[to[1]] * value[to[1]];
    out[2] = sign[to[2]] * value[to[2]];
    return out;
  }

  rotationToUser(value: Quadruplet, out: Quaternion): Quaternion {
    const { to, rotationSign: sign } = this;
    out[0] = sign[to[0]] * value[to[0]];
    out[1] = sign[to[1]] * value[to[1]];
    out[2] = sign[to[2]] * value[to[2]];
    out[3] = value[3];
    return out;
  }

  poseReader(): PoseReader {
    return new PoseReader(this);
  }
}

// Reads the caller's poses in the solver's coordinates; each transform is converted once per frame. Every transform
// keeps one pose, converted again in place in each frame that reads it.
export class PoseReader {
  private readonly kernels: FrameKernels;
  private readonly poses = new Map<number, SolverPose>();
  // Counts begin calls, so a pose read in an earlier frame converts again.
  private frame = 0;
  private user: PoseSource = () => IDENTITY;
  private readonly read: PoseSource = (id) => {
    let pose = this.poses.get(id);
    if (!pose) {
      pose = new SolverPose(this.kernels);
      this.poses.set(id, pose);
    }
    if (pose.frame !== this.frame) pose.convert(this.user(id), this.frame);
    return pose;
  };

  constructor(axes: Axes) {
    this.kernels = axes.kernels;
  }

  begin(userPoses: PoseSource): PoseSource {
    this.frame++;
    this.user = userPoses;
    return this.read;
  }
}

const IDENTITY: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };

// A pose in the user's coordinates seen in the solver's, rounded to Float32. Rotation and scale convert only when read.
class SolverPose implements Pose {
  readonly matrix: Matrix4 = unsetMatrix();
  readonly position: Vector3 = unsetVector();
  // The frame of the last conversion.
  frame = -1;
  private readonly kernels: FrameKernels;
  private user: Pose = IDENTITY;
  private readonly solverRotation: Quaternion = unsetQuaternion();
  private readonly solverScale: Vector3 = unsetVector();
  private rotationConverted = false;
  private scaleConverted = false;

  constructor(kernels: FrameKernels) {
    this.kernels = kernels;
  }

  convert(user: Pose, frame: number): void {
    this.user = user;
    this.frame = frame;
    this.rotationConverted = false;
    this.scaleConverted = false;
    this.kernels.matrix(user.matrix, this.matrix);
    this.kernels.position(user.position, this.position);
  }

  get rotation(): Quaternion {
    if (!this.rotationConverted) {
      this.kernels.rotation(this.user.rotation, this.solverRotation);
      this.rotationConverted = true;
    }
    return this.solverRotation;
  }

  get scale(): Vector3 {
    if (!this.scaleConverted) {
      this.kernels.scale(this.user.scale, this.solverScale);
      this.scaleConverted = true;
    }
    return this.solverScale;
  }
}

const axisNamed = (name: string): Axis => (name === 'x' || name === 'z' ? name : 'y');
const negated = (axis: Axis): SignedAxis => (axis === 'x' ? '-x' : axis === 'y' ? '-y' : '-z');
