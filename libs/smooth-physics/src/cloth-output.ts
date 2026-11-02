// A cloth's results in the scene's coordinates, copied out of the solver's flat buffers when first read after a frame,
// into arrays allocated once.
import type { Axes } from './coordinates.ts';
import type { Quaternion } from './float32/quaternion.ts';
import type { Vector3 } from './float32/vector.ts';

// Reused: each frame writes new values into the same arrays, so a value kept across frames must be copied.
export type ClothOutput = {
  // World position of each particle.
  readonly positions: readonly Vector3[];
  // World rotation of each particle's bone.
  readonly rotations: readonly Quaternion[];
  // Pose relative to the parent bone, for bones that move; localValid[i] is 1 where it is set.
  readonly localPositions: readonly Vector3[];
  readonly localRotations: readonly Quaternion[];
  readonly localValid: Uint8Array;
};

// Flat buffers (see particle-buffers.ts) that keep their identity for the cloth's life.
export type SolverOutput = {
  readonly particleCount: number;
  readonly positions: Float64Array;
  readonly outputRotations: Float64Array;
  readonly outputLocalPositions: Float64Array;
  readonly outputLocalRotations: Float64Array;
  readonly outputLocalValid: Uint8Array;
  readonly outputFrame: number;
};

export function clothOutput({ solver, axes }: { solver: SolverOutput; axes: Axes }): ClothOutput {
  return new ConvertedOutput({ solver, axes });
}

class ConvertedOutput implements ClothOutput {
  readonly localValid: Uint8Array;
  private readonly solver: SolverOutput;
  private readonly axes: Axes;
  // The output frame each array was last converted for, so each converts at most once per frame.
  private readonly convertedFrame = { positions: -1, rotations: -1, localPositions: -1, localRotations: -1 };
  private readonly userPositions: Vector3[];
  private readonly userRotations: Quaternion[];
  private readonly userLocalPositions: Vector3[];
  private readonly userLocalRotations: Quaternion[];

  constructor({ solver, axes }: { solver: SolverOutput; axes: Axes }) {
    const particleCount = solver.particleCount;
    this.solver = solver;
    this.axes = axes;
    this.localValid = solver.outputLocalValid;
    this.userPositions = Array.from({ length: particleCount }, (): Vector3 => [0, 0, 0]);
    this.userRotations = Array.from({ length: particleCount }, (): Quaternion => [0, 0, 0, 1]);
    this.userLocalPositions = Array.from({ length: particleCount }, (): Vector3 => [0, 0, 0]);
    this.userLocalRotations = Array.from({ length: particleCount }, (): Quaternion => [0, 0, 0, 1]);
  }

  get positions(): readonly Vector3[] {
    const { solver, axes, userPositions } = this;
    if (this.convertedFrame.positions === solver.outputFrame) return userPositions;
    userPositions.forEach((position, particle) => axes.kernels.vectorToUser(solver.positions, particle * 3, position));
    this.convertedFrame.positions = solver.outputFrame;
    return userPositions;
  }

  get rotations(): readonly Quaternion[] {
    const { solver, axes, userRotations } = this;
    if (this.convertedFrame.rotations === solver.outputFrame) return userRotations;
    userRotations.forEach((rotation, particle) => axes.kernels.rotationToUser(solver.outputRotations, particle * 4, rotation));
    this.convertedFrame.rotations = solver.outputFrame;
    return userRotations;
  }

  get localPositions(): readonly Vector3[] {
    const { solver, axes, userLocalPositions } = this;
    if (this.convertedFrame.localPositions === solver.outputFrame) return userLocalPositions;
    userLocalPositions.forEach((position, particle) => axes.kernels.vectorToUser(solver.outputLocalPositions, particle * 3, position));
    this.convertedFrame.localPositions = solver.outputFrame;
    return userLocalPositions;
  }

  get localRotations(): readonly Quaternion[] {
    const { solver, axes, userLocalRotations } = this;
    if (this.convertedFrame.localRotations === solver.outputFrame) return userLocalRotations;
    userLocalRotations.forEach((rotation, particle) => axes.kernels.rotationToUser(solver.outputLocalRotations, particle * 4, rotation));
    this.convertedFrame.localRotations = solver.outputFrame;
    return userLocalRotations;
  }
}
