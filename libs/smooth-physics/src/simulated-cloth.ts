import {
  add,
  arcCosine,
  clampSigned,
  divide,
  fround,
  interpolate,
  inverseSquareRoot,
  maximum,
  multiply,
  PI,
  saturate,
  sine,
  subtract,
  toDegrees,
} from './float32/scalar.ts';
import { quaternionAt, quaternionBuffer, vectorAt, vectorBuffer, writeQuaternion, writeVector } from './particle-buffers.ts';
import {
  addVectors,
  divideVector,
  interpolateVectors,
  length,
  lengthSquared,
  negateVector,
  scaleVector,
  subtractVectors,
  vector,
  ZERO,
  type ReadonlyVector3,
  type Vector3,
} from './float32/vector.ts';
import {
  dotQuaternions,
  invertQuaternionInto,
  multiplyQuaternionsInto,
  normalizeQuaternionInto,
  rotateVector,
  rotateVectorInto,
  sphericalInterpolationInto,
  type Quaternion,
  type ReadonlyQuaternion,
} from './float32/quaternion.ts';
import { LOOK_ROTATION, lookRotationAt } from './float32/look-rotation.ts';
import { evaluateCurve } from './curves.ts';
import type { ClothParameters } from './parameters.ts';
import { Axes, SOLVER_COORDINATES } from './coordinates.ts';
import { clothOutput, type ClothOutput } from './cloth-output.ts';
import type { ClothSettings } from './authoring.ts';
import { colliderSize, colliderType, FixedPointAccumulator } from './collision.ts';
import type { ColliderRecord } from './scene-format/types.ts';
import { Attribute, isSimulated } from './cloth-mesh/attributes.ts';
import type { ClothMesh } from './cloth-mesh/types.ts';
import { createDistanceData, type DistanceData } from './constraint-data/distance.ts';
import { createBendingData, type BendingData } from './constraint-data/bending.ts';
import { createInertiaData, type InertiaData } from './constraint-data/inertia.ts';
import type { ForceInput, ForceMode, PoseSource, Precision, FrequencyScale, ClothCenter, ClothCollider, ClothStatistics, ClothTiming } from './cloth-state.ts';
import * as roundedKernels from './solver.ts';
import * as defaultKernels from './solver-unrounded.ts';

const EPSILON = fround(1e-8);
// The step reads these codes: 1 adds, 2 sets; 10 and 11 do the same without depth scaling.
const FORCE_CODES: Readonly<Record<ForceMode, readonly [scaled: number, uniform: number]>> = { add: [1, 10], set: [2, 11] };

// The behind-limit axes, indexed by ClothConfiguration.motion.behindLimitAxis.
const NORMAL_AXES: readonly ReadonlyVector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];

const NATIVE_AXES = new Axes(SOLVER_COORDINATES);

// Scales the vector in place down to the limit when it is longer, and returns it.
function clampVectorLength(value: Vector3, limit: number): Vector3 {
  const valueLength = length(value);
  if (valueLength > fround(1e-9) && valueLength > limit) {
    const factor = divide(limit, valueLength);
    value[0] = multiply(value[0], factor);
    value[1] = multiply(value[1], factor);
    value[2] = multiply(value[2], factor);
  }
  return value;
}

// The angle in radians of the rotation from one quaternion to the other, taken the short way around. Nearly equal
// rotations count as no rotation.
function rotationAngle(from: ReadonlyQuaternion, to: ReadonlyQuaternion): number {
  const halfAngleCosine = dotQuaternions(from, to);
  if (Math.abs(halfAngleCosine) >= fround(0.9999)) return 0;
  const angle = multiply(arcCosine(clampSigned(halfAngleCosine)), 2);
  return angle > PI ? subtract(fround(Math.PI * 2), angle) : angle;
}

// Per-frame work space for the array helpers of quaternion.ts: a rotation at 0..3, a vector or a second rotation
// from 4, and an amount at 8.
const SCRATCH = new Float64Array(9);
const UP_DIRECTION = new Float64Array([0, 1, 0]);
const FORWARD_DIRECTION = new Float64Array([0, 0, 1]);
const IDENTITY_ROTATION: ReadonlyQuaternion = [0, 0, 0, 1];

// Per-frame work vectors of the center's math, which reads them with the plain array helpers of vector.ts. The
// fractional literals give them double storage in every engine. NaN does in V8 but not in JavaScriptCore, which marks
// holes in double storage with NaN and so keeps an array holding NaN as boxed values; helpers that met both kinds
// made the plain solver cases 2-5% slower in WebKit.
const FRAME_DELTA: Vector3 = [0.5, 0.5, 0.5];
const VELOCITY: Vector3 = [0.5, 0.5, 0.5];
const SMOOTH_POSITION: Vector3 = [0.5, 0.5, 0.5];
const SMOOTH_DELTA: Vector3 = [0.5, 0.5, 0.5];
const WORK_OLD_POSITION: Vector3 = [0.5, 0.5, 0.5];
const WORK_OLD_ROTATION: Quaternion = [0.5, 0.5, 0.5, 0.5];
const DELTA: Vector3 = [0.5, 0.5, 0.5];
const WORLD_SCALE: Vector3 = [0.5, 0.5, 0.5];
const HELD_BACK_SHIFT: Vector3 = [0.5, 0.5, 0.5];

// Turns the position around the pivot by the rotation, then moves it by the shift, into SCRATCH[4..6].
function shiftPositionToScratch(position: Vector3, pivot: Vector3, shift: Vector3, rotation: ReadonlyQuaternion): void {
  SCRATCH[0] = rotation[0];
  SCRATCH[1] = rotation[1];
  SCRATCH[2] = rotation[2];
  SCRATCH[3] = rotation[3];
  SCRATCH[4] = subtract(position[0], pivot[0]);
  SCRATCH[5] = subtract(position[1], pivot[1]);
  SCRATCH[6] = subtract(position[2], pivot[2]);
  rotateVectorInto(SCRATCH, 0, SCRATCH, 4, SCRATCH, 4);
  SCRATCH[4] = add(pivot[0], add(SCRATCH[4], shift[0]));
  SCRATCH[5] = add(pivot[1], add(SCRATCH[5], shift[1]));
  SCRATCH[6] = add(pivot[2], add(SCRATCH[6], shift[2]));
}

// In-place forms for the poses that the center and the colliders own.
function shiftPositionInPlace(position: Vector3, pivot: Vector3, shift: Vector3, rotation: ReadonlyQuaternion): void {
  shiftPositionToScratch(position, pivot, shift, rotation);
  position[0] = SCRATCH[4];
  position[1] = SCRATCH[5];
  position[2] = SCRATCH[6];
}

// Writes shiftRotation * rotation into rotation.
function turnRotationInPlace(rotation: Quaternion, shiftRotation: ReadonlyQuaternion): void {
  SCRATCH[0] = shiftRotation[0];
  SCRATCH[1] = shiftRotation[1];
  SCRATCH[2] = shiftRotation[2];
  SCRATCH[3] = shiftRotation[3];
  SCRATCH[4] = rotation[0];
  SCRATCH[5] = rotation[1];
  SCRATCH[6] = rotation[2];
  SCRATCH[7] = rotation[3];
  multiplyQuaternionsInto(SCRATCH, 0, SCRATCH, 4, SCRATCH, 4);
  rotation[0] = SCRATCH[4];
  rotation[1] = SCRATCH[5];
  rotation[2] = SCRATCH[6];
  rotation[3] = SCRATCH[7];
}

function assignVector(target: Vector3, source: ReadonlyVector3): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function assignQuaternion(target: Quaternion, source: ReadonlyQuaternion): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
}

// subtractVectors(left, right) into target.
function assignDifference(target: Vector3, left: ReadonlyVector3, right: ReadonlyVector3): void {
  target[0] = subtract(left[0], right[0]);
  target[1] = subtract(left[1], right[1]);
  target[2] = subtract(left[2], right[2]);
}

// interpolateVectors(from, to, amount) into target, which may be from or to.
function assignInterpolation(target: Vector3, from: ReadonlyVector3, to: ReadonlyVector3, amount: number): void {
  target[0] = interpolate(from[0], to[0], amount);
  target[1] = interpolate(from[1], to[1], amount);
  target[2] = interpolate(from[2], to[2], amount);
}

// The spherical interpolation from `from` to `to` by amount, written into target, which may be from or to.
function assignSphericalInterpolation(target: Quaternion, from: ReadonlyQuaternion, to: ReadonlyQuaternion, amount: number): void {
  SCRATCH[0] = from[0];
  SCRATCH[1] = from[1];
  SCRATCH[2] = from[2];
  SCRATCH[3] = from[3];
  SCRATCH[4] = to[0];
  SCRATCH[5] = to[1];
  SCRATCH[6] = to[2];
  SCRATCH[7] = to[3];
  SCRATCH[8] = amount;
  sphericalInterpolationInto(SCRATCH, 0, SCRATCH, 4, SCRATCH, 8, SCRATCH, 0);
  target[0] = SCRATCH[0];
  target[1] = SCRATCH[1];
  target[2] = SCRATCH[2];
  target[3] = SCRATCH[3];
}

function normalizeQuaternionInPlace(rotation: Quaternion): void {
  SCRATCH[0] = rotation[0];
  SCRATCH[1] = rotation[1];
  SCRATCH[2] = rotation[2];
  SCRATCH[3] = rotation[3];
  normalizeQuaternionInto(SCRATCH, 0, SCRATCH, 0);
  rotation[0] = SCRATCH[0];
  rotation[1] = SCRATCH[1];
  rotation[2] = SCRATCH[2];
  rotation[3] = SCRATCH[3];
}

// The rotation from one quaternion to the other, multiplyQuaternions(to, invertQuaternion(from)), into target.
function assignRotationFromTo(target: Quaternion, from: ReadonlyQuaternion, to: ReadonlyQuaternion): void {
  SCRATCH[0] = from[0];
  SCRATCH[1] = from[1];
  SCRATCH[2] = from[2];
  SCRATCH[3] = from[3];
  SCRATCH[4] = to[0];
  SCRATCH[5] = to[1];
  SCRATCH[6] = to[2];
  SCRATCH[7] = to[3];
  invertQuaternionInto(SCRATCH, 0, SCRATCH, 0);
  multiplyQuaternionsInto(SCRATCH, 4, SCRATCH, 0, SCRATCH, 0);
  target[0] = SCRATCH[0];
  target[1] = SCRATCH[1];
  target[2] = SCRATCH[2];
  target[3] = SCRATCH[3];
}

// The unit rotation axis into target, or zero for a rotation too small to have a reliable axis.
function assignRotationAxis(target: Vector3, rotation: ReadonlyQuaternion): void {
  const halfAngle = Math.abs(rotation[3]) < fround(0.9999) ? arcCosine(rotation[3]) : 0;
  const halfAngleSine = sine(halfAngle);
  if (Math.abs(halfAngleSine) < fround(1e-6)) {
    target[0] = 0;
    target[1] = 0;
    target[2] = 0;
    return;
  }
  target[0] = divide(rotation[0], halfAngleSine);
  target[1] = divide(rotation[1], halfAngleSine);
  target[2] = divide(rotation[2], halfAngleSine);
}

// A collider scale component, kept away from zero.
const nonZeroScale = (component: number): number => (component < fround(1e-6) && component > fround(-1e-6) ? fround(1e-6) : component);
const signOf = (component: number): number => (component > 0 ? 1 : component < 0 ? -1 : 0);

export class SimulatedCloth {
  readonly name: string;
  readonly mesh: ClothMesh;
  readonly parameters: ClothParameters;
  readonly particleCount: number;
  readonly distanceData: DistanceData;
  bendingData: BendingData | null;
  inertiaData: InertiaData;
  readonly colliders: ClothCollider[];
  positions: Float64Array;
  rotations: Float64Array;
  nextPositions: Float64Array;
  oldPositions: Float64Array;
  oldRotations: Float64Array;
  basePositions: Float64Array;
  baseRotations: Float64Array;
  inputOldPositions: Float64Array;
  inputOldRotations: Float64Array;
  velocityOrigins: Float64Array;
  displayPositions: Float64Array;
  velocities: Float64Array;
  displacementVelocities: Float64Array;
  frictions: number[];
  staticFrictions: number[];
  collisionNormals: Float64Array;
  stepPosePositions: Float64Array;
  stepPoseRotations: Float64Array;
  rotationBuffer: Float64Array;
  lengthBuffer: number[];
  localPositionBuffer: Float64Array;
  localRotationBuffer: Float64Array;
  restorationVectors: Float64Array;
  temporaryPositions: Float64Array;
  temporaryRotations: Float64Array;
  readonly accumulator: FixedPointAccumulator;
  outputPositions: Float64Array;
  outputRotations: Float64Array;
  outputLocalPositions: Float64Array;
  outputLocalRotations: Float64Array;
  readonly outputLocalValid: Uint8Array;
  readonly timing: ClothTiming;
  readonly center: ClothCenter;
  readonly stats: ClothStatistics = { steps: 0, contacts: 0, resets: 0 };
  triangleNormals: Float64Array | null = null;
  triangleTangents: Float64Array | null = null;
  activeColliders: ClothCollider[] = [];
  lastTriangleNormals: Vector3[] | null = null;
  lastTriangleTangents: Vector3[] | null = null;
  precision: Precision = 'default';
  enabled = true;
  skipWrite = false;
  // Declared last: JavaScriptCore keeps a limited number of fields inline, and the solver reads the ones above.
  // Counts finished frames, so converted outputs know when they are stale.
  outputFrame = 0;
  // The results in the scene's coordinates.
  readonly output: ClothOutput;
  readonly axes: Axes;
  // The resolved settings in the scene's coordinates; parameters are derived from them.
  settings: ClothSettings;

  constructor({
    mesh,
    parameters,
    colliders,
    axes = NATIVE_AXES,
    settings,
  }: {
    mesh: ClothMesh;
    parameters: ClothParameters;
    colliders: readonly ColliderRecord[];
    axes?: Axes;
    settings: ClothSettings;
  }) {
    const particleCount = mesh.vertexCount;
    this.axes = axes;
    this.settings = settings;
    this.name = mesh.name;
    this.mesh = mesh;
    this.parameters = parameters;
    this.particleCount = particleCount;

    this.distanceData = createDistanceData(mesh);
    this.bendingData = parameters.bending.stiffness > fround(1e-8) ? createBendingData(mesh) : null;
    this.inertiaData = createInertiaData({ mesh, worldGravityDirection: parameters.worldGravityDirection });

    this.colliders = colliders.map((collider) => ({
      transformId: collider.transform,
      type: colliderType(collider),
      reverse: collider.reverseDirection,
      size: colliderSize(collider),
      center: vector(collider.center.x, collider.center.y, collider.center.z),
      enabled: collider.enabled,
      framePosition: [0, 0, 0],
      frameRotation: [0, 0, 0, 1],
      frameScale: [1, 1, 1],
      oldFramePosition: [0, 0, 0],
      oldFrameRotation: [0, 0, 0, 1],
      currentPosition: [0, 0, 0],
      currentRotation: [0, 0, 0, 1],
      oldPosition: [0, 0, 0],
      oldRotation: [0, 0, 0, 1],
      work: null,
      reset: false,
      lastSeenPosition: null,
    }));

    this.positions = vectorBuffer(particleCount);
    this.rotations = quaternionBuffer(particleCount);
    this.nextPositions = vectorBuffer(particleCount);
    this.oldPositions = vectorBuffer(particleCount);
    this.oldRotations = quaternionBuffer(particleCount);
    this.basePositions = vectorBuffer(particleCount);
    this.baseRotations = quaternionBuffer(particleCount);
    this.inputOldPositions = vectorBuffer(particleCount);
    this.inputOldRotations = quaternionBuffer(particleCount);
    this.velocityOrigins = vectorBuffer(particleCount);
    this.displayPositions = vectorBuffer(particleCount);
    this.velocities = vectorBuffer(particleCount);
    this.displacementVelocities = vectorBuffer(particleCount);
    this.frictions = Array.from({ length: particleCount }, () => 0);
    this.staticFrictions = Array.from({ length: particleCount }, () => 0);
    this.collisionNormals = vectorBuffer(particleCount);
    this.stepPosePositions = vectorBuffer(particleCount);
    this.stepPoseRotations = quaternionBuffer(particleCount);
    this.rotationBuffer = quaternionBuffer(particleCount);
    this.lengthBuffer = Array.from({ length: particleCount }, () => 0);
    this.localPositionBuffer = vectorBuffer(particleCount);
    this.localRotationBuffer = quaternionBuffer(particleCount);
    this.restorationVectors = vectorBuffer(particleCount);
    this.temporaryPositions = vectorBuffer(particleCount);
    this.temporaryRotations = quaternionBuffer(particleCount);
    this.accumulator = new FixedPointAccumulator(particleCount);
    this.outputPositions = vectorBuffer(particleCount);
    this.outputRotations = quaternionBuffer(particleCount);
    this.outputLocalPositions = vectorBuffer(particleCount);
    this.outputLocalRotations = quaternionBuffer(particleCount);
    this.outputLocalValid = new Uint8Array(particleCount);
    this.output = clothOutput({ solver: this, axes });

    this.timing = {
      time: 0,
      oldTime: 0,
      stepTime: 0,
      oldStepTime: 0,
      intervalEndTime: 0,
      intervalStartTime: 0,
      reset: true,
      timeReset: true,
      anchorShifted: false,
      running: false,
      teleportShift: false,
      stepCount: 0,
      skippedSteps: 0,
      frameDeltaTime: 0,
      appliedTimeScale: 1,
      timeScale: 1,
      stepFraction: 1,
      settleWeight: 1,
      influenceWeight: 1,
      fadeWeight: 1,
      gravityAlignment: 1,
      gravityFalloffRatio: 1,
      worldScaleRatio: 1,
      restScale: mesh.restScale,
      forceMode: 0,
      pendingForce: [0, 0, 0],
    };

    this.center = {
      anchorWorldPosition: [0, 0, 0],
      anchorWorldRotation: [0, 0, 0, 1],
      anchorWorldScale: [1, 1, 1],
      oldAnchorWorldPosition: [0, 0, 0],
      oldAnchorWorldRotation: [0, 0, 0, 1],
      oldAnchorWorldScale: [1, 1, 1],
      frameCenterPosition: [0, 0, 0],
      frameCenterRotation: [0, 0, 0, 1],
      frameCenterScale: [1, 1, 1],
      oldFrameCenterPosition: [0, 0, 0],
      oldFrameCenterRotation: [0, 0, 0, 1],
      oldFrameCenterScale: [1, 1, 1],
      stepCenterPosition: [0, 0, 0],
      stepCenterRotation: [0, 0, 0, 1],
      oldStepCenterPosition: [0, 0, 0],
      oldStepCenterRotation: [0, 0, 0, 1],
      smoothedAnchorVelocity: [0, 0, 0],
      frameAnchorShift: [0, 0, 0],
      frameAnchorShiftRotation: [0, 0, 0, 1],
      stepCenterShift: [0, 0, 0],
      stepCenterShiftRotation: [0, 0, 0, 1],
      stepMovementInertia: 0,
      stepRotationInertia: 0,
      stepInertiaShift: [0, 0, 0],
      stepInertiaRotation: [0, 0, 0, 1],
      angularVelocity: 0,
      rotationAxis: [0, 0, 0],
      restLocalGravityDirection: this.inertiaData.restLocalGravityDirection,
    };
  }

  // New settings and the parameters derived from them, with the data that bending and the gravity direction need
  // built or dropped as if the cloth were created with them.
  retune({ settings, parameters }: { settings: ClothSettings; parameters: ClothParameters }): void {
    const usesBending = parameters.bending.stiffness > fround(1e-8);
    if (usesBending !== (this.bendingData !== null)) this.bendingData = usesBending ? createBendingData(this.mesh) : null;
    if (parameters.worldGravityDirection.some((component, axis) => component !== this.parameters.worldGravityDirection[axis])) {
      this.inertiaData = createInertiaData({ mesh: this.mesh, worldGravityDirection: parameters.worldGravityDirection });
      this.center.restLocalGravityDirection = this.inertiaData.restLocalGravityDirection;
    }
    Object.assign(this.parameters, parameters);
    this.settings = settings;
  }

  reset(): void {
    this.timing.reset = true;
    this.timing.timeReset = true;
    for (const collider of this.colliders) collider.reset = true;
  }

  // The force is in the scene's coordinates.
  addForce({ force, mode = 'add', uniform = false }: ForceInput): void {
    const [forceX, forceY, forceZ] = this.axes.vectorToSolver(force);
    this.timing.forceMode = FORCE_CODES[mode][uniform ? 1 : 0];
    this.timing.pendingForce = vector(forceX, forceY, forceZ);
  }

  updateTime({
    frameDeltaTime,
    simulationDeltaTime,
    maximumSteps,
    globalTimeScale = 1,
  }: {
    frameDeltaTime: number;
    simulationDeltaTime: number;
    maximumSteps: number;
    globalTimeScale?: number;
  }): void {
    const timing = this.timing;
    if (timing.timeReset) {
      timing.time = 0;
      timing.oldTime = 0;
      timing.stepTime = 0;
      timing.oldStepTime = 0;
      timing.intervalEndTime = 0;
      timing.intervalStartTime = 0;
    }

    timing.frameDeltaTime = fround(frameDeltaTime);
    const timeScale = multiply(timing.timeScale, globalTimeScale);
    timing.appliedTimeScale = timeScale;
    const addedTime = multiply(timing.frameDeltaTime, timeScale);
    let time = add(timing.time, addedTime);

    const unsimulatedTime = subtract(time, timing.stepTime);
    const stepCount = Math.trunc(divide(unsimulatedTime, simulationDeltaTime));
    timing.stepCount = Math.min(stepCount, maximumSteps);
    timing.skippedSteps = stepCount - timing.stepCount;
    // Steps beyond the maximum are dropped, and the clock moves back by their time instead of catching up later.
    if (timing.skippedSteps > 0) time = subtract(time, multiply(simulationDeltaTime, timing.skippedSteps));
    // A frame that adds no time runs no steps, and the step clock is set so a step comes due as soon as time moves on.
    if (timing.stepCount > 0 && addedTime === 0) {
      timing.stepCount = 0;
      timing.skippedSteps = 0;
      timing.stepTime = add(subtract(time, simulationDeltaTime), fround(0.0001));
    }

    if (timing.stepCount > 0) {
      timing.intervalStartTime = timing.intervalEndTime;
      timing.intervalEndTime = time;
      timing.oldStepTime = timing.stepTime;
    }
    timing.oldTime = timing.time;
    timing.time = time;
    timing.running = timing.stepCount > 0;
  }

  simulate({ pose, simulationDeltaTime, frequencyScale }: { pose: PoseSource; simulationDeltaTime: number; frequencyScale: FrequencyScale }): void {
    const mesh = this.mesh;
    const particleCount = this.particleCount;
    this.skipWrite = false;
    const kernels = this.precision === 'rounded' ? roundedKernels : defaultKernels;
    kernels.skin(this, pose);
    this.centerAndInertia(pose(mesh.anchorTransformId), simulationDeltaTime);
    this.beginFrame();
    for (const collider of this.colliders) this.prepareColliders(collider, pose(collider.transformId));
    this.stats.steps = this.timing.stepCount;
    this.stats.contacts = 0;

    for (let step = 0; step < this.timing.stepCount; step++) {
      this.beginStep(simulationDeltaTime);
      for (const collider of this.colliders) kernels.prepareColliderStep(this, collider);
      kernels.integrateParticles(this, simulationDeltaTime, frequencyScale);
      kernels.updateChainPose(this);
      kernels.tether(this);
      kernels.solveDistance(this, frequencyScale);
      kernels.solveAngle(this, frequencyScale);
      for (let particle = 0; particle < particleCount; particle++) this.accumulator.clear(particle);
      kernels.solveBending(this, frequencyScale);
      const collisionMode = this.colliders.length ? this.parameters.collider.mode : 0;
      if (collisionMode === 1) kernels.solvePointCollision(this);
      else if (collisionMode === 2) kernels.solveEdgeCollision(this);
      kernels.solveDistance(this, frequencyScale);
      this.solveMotion();
      kernels.finishStep(this, simulationDeltaTime);
      for (const collider of this.colliders) {
        assignVector(collider.oldPosition, collider.currentPosition);
        assignQuaternion(collider.oldRotation, collider.currentRotation);
      }
    }

    kernels.displayPosition(this, simulationDeltaTime);
    kernels.writeLineFrames(this);
    if (mesh.triangles.length) kernels.writeTriangleFrames(this);
    kernels.outputs(this, pose);
    if (this.timing.running)
      for (const collider of this.colliders) {
        assignVector(collider.oldFramePosition, collider.framePosition);
        assignQuaternion(collider.oldFrameRotation, collider.frameRotation);
      }
    this.endFrame();
    this.resetWhenNonFinite();
  }

  // Watchdog: a non-finite state resets the simulation instead of spreading.
  private resetWhenNonFinite(): void {
    const oldPositions = this.oldPositions;
    const outputRotations = this.outputRotations;
    for (let particle = 0; particle < this.particleCount; particle++) {
      const positionOffset = particle * 3;
      const rotationOffset = particle * 4;
      // The sum is non-finite when any component is.
      const sum =
        oldPositions[positionOffset] +
        oldPositions[positionOffset + 1] +
        oldPositions[positionOffset + 2] +
        outputRotations[rotationOffset] +
        outputRotations[rotationOffset + 1] +
        outputRotations[rotationOffset + 2] +
        outputRotations[rotationOffset + 3];
      if (Number.isFinite(sum)) continue;
      this.stats.resets++;
      console.warn(`smooth-physics: ${this.name} became non-finite at particle ${particle}; the simulation was reset.`);
      this.skipWrite = true;
      this.reset();
      return;
    }
  }

  centerAndInertia(centerPose: { position: Vector3; rotation: Quaternion; scale: Vector3 }, simulationDeltaTime: number): void {
    const timing = this.timing;
    const center = this.center;
    const inertia = this.parameters.inertia;
    // Copied: a pose source may write the next frame's pose into the same arrays.
    const anchorWorldPosition = center.anchorWorldPosition;
    const anchorWorldRotation = center.anchorWorldRotation;
    const anchorWorldScale = center.anchorWorldScale;
    assignVector(anchorWorldPosition, centerPose.position);
    assignQuaternion(anchorWorldRotation, centerPose.rotation);
    assignVector(anchorWorldScale, centerPose.scale);
    const anchorScaleRatio = divide(length(anchorWorldScale), length(timing.restScale));
    let oldAnchorWorldPosition: Vector3 = center.oldAnchorWorldPosition;
    const oldAnchorWorldRotation = center.oldAnchorWorldRotation;
    this.centerFrame();

    // A jump past the teleport distance or rotation resets the cloth (mode 1) or carries it along unchanged (mode 2).
    const frameDeltaVector = FRAME_DELTA;
    assignDifference(frameDeltaVector, anchorWorldPosition, oldAnchorWorldPosition);
    const frameDeltaAngle = rotationAngle(oldAnchorWorldRotation, anchorWorldRotation);
    if (inertia.teleportMode !== 0 && !timing.reset) {
      const teleported =
        length(frameDeltaVector) >= multiply(inertia.teleportDistance, anchorScaleRatio) || toDegrees(frameDeltaAngle) >= inertia.teleportRotation;
      if (teleported && inertia.teleportMode === 1) timing.reset = true;
      if (teleported && inertia.teleportMode === 2) timing.teleportShift = true;
    }

    // Movement smoothing: the cloth feels only the anchor's smoothed velocity over the frame, and the rest of the
    // anchor's movement carries it along.
    const smoothDeltaVector = SMOOTH_DELTA;
    smoothDeltaVector[0] = 0;
    smoothDeltaVector[1] = 0;
    smoothDeltaVector[2] = 0;
    if (inertia.movementInertiaSmoothing >= fround(1e-6) && !(timing.teleportShift || timing.reset)) {
      if (timing.running) {
        const velocity = VELOCITY;
        if (timing.frameDeltaTime > 0) {
          velocity[0] = divide(frameDeltaVector[0], timing.frameDeltaTime);
          velocity[1] = divide(frameDeltaVector[1], timing.frameDeltaTime);
          velocity[2] = divide(frameDeltaVector[2], timing.frameDeltaTime);
        } else {
          velocity[0] = 0;
          velocity[1] = 0;
          velocity[2] = 0;
        }
        const speedLimit = multiply(inertia.movementSpeedLimit, anchorScaleRatio);
        if (speedLimit >= 0) clampVectorLength(velocity, speedLimit);
        // How far the smoothed velocity moves toward this frame's velocity: 1 without smoothing, 0.01 at full smoothing.
        const velocityBlend = saturate(add(multiply(fround(Math.pow(subtract(1, inertia.movementInertiaSmoothing), 3)), fround(0.99)), fround(0.01)));
        assignInterpolation(center.smoothedAnchorVelocity, center.smoothedAnchorVelocity, velocity, velocityBlend);
      }
      const smoothedAnchorVelocity = center.smoothedAnchorVelocity;
      const smoothPosition = SMOOTH_POSITION;
      smoothPosition[0] = subtract(anchorWorldPosition[0], multiply(smoothedAnchorVelocity[0], timing.frameDeltaTime));
      smoothPosition[1] = subtract(anchorWorldPosition[1], multiply(smoothedAnchorVelocity[1], timing.frameDeltaTime));
      smoothPosition[2] = subtract(anchorWorldPosition[2], multiply(smoothedAnchorVelocity[2], timing.frameDeltaTime));
      assignDifference(smoothDeltaVector, smoothPosition, oldAnchorWorldPosition);
      oldAnchorWorldPosition = smoothPosition;
      timing.anchorShifted = true;
    }

    const centerWorldPosition = center.frameCenterPosition;
    const centerWorldRotation = center.frameCenterRotation;
    assignVector(center.frameCenterScale, anchorWorldScale);
    if (timing.reset) {
      assignVector(center.oldAnchorWorldPosition, anchorWorldPosition);
      assignQuaternion(center.oldAnchorWorldRotation, anchorWorldRotation);
      assignVector(center.oldAnchorWorldScale, anchorWorldScale);
      assignVector(center.oldFrameCenterPosition, centerWorldPosition);
      assignQuaternion(center.oldFrameCenterRotation, centerWorldRotation);
      assignVector(center.oldFrameCenterScale, anchorWorldScale);
      assignVector(center.stepCenterPosition, centerWorldPosition);
      assignQuaternion(center.stepCenterRotation, centerWorldRotation);
      assignVector(center.oldStepCenterPosition, centerWorldPosition);
      assignQuaternion(center.oldStepCenterRotation, centerWorldRotation);
    }

    if (timing.reset) {
      assignVector(center.frameAnchorShift, ZERO);
      assignQuaternion(center.frameAnchorShiftRotation, IDENTITY_ROTATION);
      assignVector(center.smoothedAnchorVelocity, ZERO);
    } else this.shiftInertia(oldAnchorWorldPosition, smoothDeltaVector, anchorScaleRatio, simulationDeltaTime);

    if (timing.reset || timing.timeReset) {
      timing.settleWeight = this.parameters.settleTime > fround(1e-6) ? 0 : 1;
      timing.influenceWeight = timing.settleWeight;
    }
  }

  // The center frame, written to frameCenterPosition and frameCenterRotation: the anchor's, or, when the mesh has
  // fixed vertices for the center, their mean position and mean rest-relative orientation.
  private centerFrame(): void {
    const center = this.center;
    const fixedVertices = this.mesh.fixedVerticesForCenter;
    if (!fixedVertices.length) {
      assignVector(center.frameCenterPosition, center.anchorWorldPosition);
      assignQuaternion(center.frameCenterRotation, center.anchorWorldRotation);
      return;
    }
    const positions = this.positions;
    const inverseRestRotations = this.mesh.vertexInverseRestRotations;
    let positionSumX = 0;
    let positionSumY = 0;
    let positionSumZ = 0;
    let normalSumX = 0;
    let normalSumY = 0;
    let normalSumZ = 0;
    let tangentSumX = 0;
    let tangentSumY = 0;
    let tangentSumZ = 0;
    for (let index = 0; index < fixedVertices.length; index++) {
      const vertex = fixedVertices[index];
      const positionOffset = vertex * 3;
      positionSumX = add(positionSumX, positions[positionOffset]);
      positionSumY = add(positionSumY, positions[positionOffset + 1]);
      positionSumZ = add(positionSumZ, positions[positionOffset + 2]);

      // The vertex rotation relative to its rest rotation, then its normal and tangent (toNormal and toTangent).
      const inverseRestRotation = inverseRestRotations[vertex];
      SCRATCH[0] = inverseRestRotation[0];
      SCRATCH[1] = inverseRestRotation[1];
      SCRATCH[2] = inverseRestRotation[2];
      SCRATCH[3] = inverseRestRotation[3];
      multiplyQuaternionsInto(this.rotations, vertex * 4, SCRATCH, 0, SCRATCH, 0);
      rotateVectorInto(SCRATCH, 0, UP_DIRECTION, 0, SCRATCH, 4);
      normalSumX = add(normalSumX, SCRATCH[4]);
      normalSumY = add(normalSumY, SCRATCH[5]);
      normalSumZ = add(normalSumZ, SCRATCH[6]);
      rotateVectorInto(SCRATCH, 0, FORWARD_DIRECTION, 0, SCRATCH, 4);
      tangentSumX = add(tangentSumX, SCRATCH[4]);
      tangentSumY = add(tangentSumY, SCRATCH[5]);
      tangentSumZ = add(tangentSumZ, SCRATCH[6]);
    }
    const vertexCount = fixedVertices.length;
    const centerWorldPosition = center.frameCenterPosition;
    centerWorldPosition[0] = divide(positionSumX, vertexCount);
    centerWorldPosition[1] = divide(positionSumY, vertexCount);
    centerWorldPosition[2] = divide(positionSumZ, vertexCount);

    // toRotation(normalize(normal sum), normalize(tangent sum)), which is lookRotation(tangent, normal): the normal
    // goes to SCRATCH[0..2] and the tangent to SCRATCH[4..6].
    const normalScale = inverseSquareRoot(add(add(multiply(normalSumX, normalSumX), multiply(normalSumY, normalSumY)), multiply(normalSumZ, normalSumZ)));
    const tangentScale = inverseSquareRoot(
      add(add(multiply(tangentSumX, tangentSumX), multiply(tangentSumY, tangentSumY)), multiply(tangentSumZ, tangentSumZ)),
    );
    SCRATCH[0] = multiply(normalSumX, normalScale);
    SCRATCH[1] = multiply(normalSumY, normalScale);
    SCRATCH[2] = multiply(normalSumZ, normalScale);
    SCRATCH[4] = multiply(tangentSumX, tangentScale);
    SCRATCH[5] = multiply(tangentSumY, tangentScale);
    SCRATCH[6] = multiply(tangentSumZ, tangentScale);
    lookRotationAt(SCRATCH, 4, SCRATCH, 0);
    const centerWorldRotation = center.frameCenterRotation;
    centerWorldRotation[0] = LOOK_ROTATION[0];
    centerWorldRotation[1] = LOOK_ROTATION[1];
    centerWorldRotation[2] = LOOK_ROTATION[2];
    centerWorldRotation[3] = LOOK_ROTATION[3];
  }

  // Positional, unlike the other methods: an object argument would be allocated every frame.
  private shiftInertia(
    oldAnchorWorldPosition: ReadonlyVector3,
    smoothDeltaVector: ReadonlyVector3,
    anchorScaleRatio: number,
    simulationDeltaTime: number,
  ): void {
    const timing = this.timing;
    const center = this.center;
    const inertia = this.parameters.inertia;
    const anchorWorldPosition = center.anchorWorldPosition;
    const anchorWorldRotation = center.anchorWorldRotation;
    const oldAnchorWorldRotation = center.oldAnchorWorldRotation;
    const frameAnchorShift = center.frameAnchorShift;
    const frameAnchorShiftRotation = center.frameAnchorShiftRotation;
    assignDifference(frameAnchorShift, anchorWorldPosition, oldAnchorWorldPosition);
    assignRotationFromTo(frameAnchorShiftRotation, oldAnchorWorldRotation, anchorWorldRotation);

    // The shift ratios are the shares of the anchor's frame movement and rotation that carry the cloth along instead
    // of acting on it as inertia. World inertia below 1 carries the rest; a teleport shift carries everything.
    let moveShiftRatio = 0;
    let rotationShiftRatio = 0;
    const workOldPosition = WORK_OLD_POSITION;
    const workOldRotation = WORK_OLD_ROTATION;
    assignVector(workOldPosition, oldAnchorWorldPosition);
    assignQuaternion(workOldRotation, oldAnchorWorldRotation);
    const worldShift = timing.teleportShift ? 1 : subtract(1, inertia.worldInertia);
    if (worldShift > EPSILON) {
      timing.anchorShifted = true;
      moveShiftRatio = worldShift;
      rotationShiftRatio = worldShift;
      assignInterpolation(workOldPosition, workOldPosition, anchorWorldPosition, worldShift);
      assignSphericalInterpolation(workOldRotation, workOldRotation, anchorWorldRotation, worldShift);
    }

    // Movement or rotation faster than its speed limit carries the cloth along by the share above the limit.
    const movementSpeedLimit = multiply(inertia.movementSpeedLimit, anchorScaleRatio);
    const deltaVector = DELTA;
    assignDifference(deltaVector, anchorWorldPosition, workOldPosition);
    const deltaAngle = rotationAngle(workOldRotation, anchorWorldRotation);
    const frameSpeed = timing.frameDeltaTime > 0 ? divide(length(deltaVector), timing.frameDeltaTime) : 0;
    const frameRotationSpeed = timing.frameDeltaTime > 0 ? divide(toDegrees(deltaAngle), timing.frameDeltaTime) : 0;
    if (frameSpeed > movementSpeedLimit && movementSpeedLimit >= 0) {
      timing.anchorShifted = true;
      const excessSpeedShare = saturate(divide(maximum(subtract(frameSpeed, movementSpeedLimit), 0), frameSpeed));
      moveShiftRatio = interpolate(moveShiftRatio, 1, excessSpeedShare);
      assignInterpolation(workOldPosition, workOldPosition, anchorWorldPosition, excessSpeedShare);
    }
    if (frameRotationSpeed > inertia.rotationSpeedLimit && inertia.rotationSpeedLimit >= 0) {
      timing.anchorShifted = true;
      const excessRotationSpeedShare = saturate(divide(maximum(subtract(frameRotationSpeed, inertia.rotationSpeedLimit), 0), frameRotationSpeed));
      rotationShiftRatio = interpolate(rotationShiftRatio, 1, excessRotationSpeedShare);
      assignSphericalInterpolation(workOldRotation, workOldRotation, anchorWorldRotation, excessRotationSpeedShare);
    }

    // Skipped steps, an unfinished settling and slowed time carry the cloth along further.
    let extraShiftRatio = 0;
    if (timing.skippedSteps > 0)
      extraShiftRatio = interpolate(
        extraShiftRatio,
        1,
        saturate(divide(multiply(timing.skippedSteps, simulationDeltaTime), multiply(timing.frameDeltaTime, timing.appliedTimeScale))),
      );
    if (timing.settleWeight < 1) extraShiftRatio = interpolate(extraShiftRatio, 1, subtract(1, timing.settleWeight));
    if (timing.appliedTimeScale < 1) extraShiftRatio = interpolate(extraShiftRatio, 1, subtract(1, timing.appliedTimeScale));
    if (extraShiftRatio > 0) {
      timing.anchorShifted = true;
      moveShiftRatio = interpolate(moveShiftRatio, 1, extraShiftRatio);
      rotationShiftRatio = interpolate(rotationShiftRatio, 1, extraShiftRatio);
    }
    if (!timing.anchorShifted) return;

    // The movement left over from smoothing carries the cloth along in full.
    frameAnchorShift[0] = multiply(frameAnchorShift[0], moveShiftRatio);
    frameAnchorShift[1] = multiply(frameAnchorShift[1], moveShiftRatio);
    frameAnchorShift[2] = multiply(frameAnchorShift[2], moveShiftRatio);
    assignSphericalInterpolation(frameAnchorShiftRotation, IDENTITY_ROTATION, frameAnchorShiftRotation, rotationShiftRatio);
    frameAnchorShift[0] = add(frameAnchorShift[0], smoothDeltaVector[0]);
    frameAnchorShift[1] = add(frameAnchorShift[1], smoothDeltaVector[1]);
    frameAnchorShift[2] = add(frameAnchorShift[2], smoothDeltaVector[2]);

    shiftPositionInPlace(center.oldFrameCenterPosition, center.oldAnchorWorldPosition, frameAnchorShift, frameAnchorShiftRotation);
    turnRotationInPlace(center.oldFrameCenterRotation, frameAnchorShiftRotation);
    shiftPositionInPlace(center.stepCenterPosition, center.oldAnchorWorldPosition, frameAnchorShift, frameAnchorShiftRotation);
    turnRotationInPlace(center.stepCenterRotation, frameAnchorShiftRotation);
  }

  beginFrame(): void {
    const timing = this.timing;
    if (timing.reset) {
      for (let particle = 0; particle < this.particleCount; particle++) {
        const position = vectorAt(this.positions, particle);
        const rotation = quaternionAt(this.rotations, particle);
        writeVector(this.nextPositions, particle, position);
        writeVector(this.oldPositions, particle, position);
        writeQuaternion(this.oldRotations, particle, rotation);
        writeVector(this.basePositions, particle, position);
        writeQuaternion(this.baseRotations, particle, rotation);
        writeVector(this.inputOldPositions, particle, position);
        writeQuaternion(this.inputOldRotations, particle, rotation);
        writeVector(this.velocityOrigins, particle, position);
        writeVector(this.displayPositions, particle, position);
        writeVector(this.velocities, particle, [0, 0, 0]);
        writeVector(this.displacementVelocities, particle, [0, 0, 0]);
        this.frictions[particle] = 0;
        this.staticFrictions[particle] = 0;
        writeVector(this.collisionNormals, particle, [0, 0, 0]);
      }
      return;
    }

    if (!timing.anchorShifted) return;
    (this.precision === 'rounded' ? roundedKernels : defaultKernels).shiftForAnchor(this);
  }

  // The frame pose is copied into the collider's own arrays: a pose source may write the next frame's pose into the
  // same arrays.
  prepareColliders(collider: ClothCollider, pose: { position: Vector3; rotation: Quaternion; scale: Vector3 }): void {
    const timing = this.timing;
    const center = this.center;
    const frameScale = collider.frameScale;
    const scale = pose.scale;
    frameScale[0] = nonZeroScale(scale[0]);
    frameScale[1] = nonZeroScale(scale[1]);
    frameScale[2] = nonZeroScale(scale[2]);
    const scaleSignX = signOf(frameScale[0]);
    const scaleSignY = signOf(frameScale[1]);
    const scaleSignZ = signOf(frameScale[2]);
    const worldRotation = collider.frameRotation;
    assignQuaternion(worldRotation, pose.rotation);
    const colliderCenter = collider.center;
    SCRATCH[0] = worldRotation[0];
    SCRATCH[1] = worldRotation[1];
    SCRATCH[2] = worldRotation[2];
    SCRATCH[3] = worldRotation[3];
    SCRATCH[4] = multiply(colliderCenter[0], scaleSignX);
    SCRATCH[5] = multiply(colliderCenter[1], scaleSignY);
    SCRATCH[6] = multiply(colliderCenter[2], scaleSignZ);
    rotateVectorInto(SCRATCH, 0, SCRATCH, 4, SCRATCH, 4);
    const position = pose.position;
    const worldPosition = collider.framePosition;
    worldPosition[0] = add(position[0], multiply(multiply(SCRATCH[4], frameScale[0]), scaleSignX));
    worldPosition[1] = add(position[1], multiply(multiply(SCRATCH[5], frameScale[1]), scaleSignY));
    worldPosition[2] = add(position[2], multiply(multiply(SCRATCH[6], frameScale[2]), scaleSignZ));

    if (timing.reset || collider.reset) {
      assignVector(collider.oldFramePosition, worldPosition);
      assignQuaternion(collider.oldFrameRotation, worldRotation);
      assignVector(collider.currentPosition, worldPosition);
      assignQuaternion(collider.currentRotation, worldRotation);
      assignVector(collider.oldPosition, worldPosition);
      assignQuaternion(collider.oldRotation, worldRotation);
      collider.reset = false;
      return;
    }

    // The collider's earlier poses move with the anchor shift, as the particles do.
    if (!timing.anchorShifted) return;
    const pivot = center.oldAnchorWorldPosition;
    const shift = center.frameAnchorShift;
    const shiftRotation = center.frameAnchorShiftRotation;
    shiftPositionInPlace(collider.oldFramePosition, pivot, shift, shiftRotation);
    turnRotationInPlace(collider.oldFrameRotation, shiftRotation);
    shiftPositionInPlace(collider.currentPosition, pivot, shift, shiftRotation);
    turnRotationInPlace(collider.currentRotation, shiftRotation);
    shiftPositionInPlace(collider.oldPosition, pivot, shift, shiftRotation);
    turnRotationInPlace(collider.oldRotation, shiftRotation);
  }

  beginStep(simulationDeltaTime: number): void {
    const timing = this.timing;
    const center = this.center;
    const parameters = this.parameters;
    timing.stepTime = add(timing.stepTime, simulationDeltaTime);
    // How far this step lies between the previous frame's end and this frame's, for interpolating the frame poses.
    const frameSpan = subtract(timing.time, timing.intervalStartTime);
    timing.stepFraction = frameSpan > 0 ? saturate(divide(subtract(timing.stepTime, timing.intervalStartTime), frameSpan)) : 1;

    const stepCenterRotation = center.stepCenterRotation;
    assignVector(center.oldStepCenterPosition, center.stepCenterPosition);
    assignQuaternion(center.oldStepCenterRotation, stepCenterRotation);
    assignInterpolation(center.stepCenterPosition, center.oldFrameCenterPosition, center.frameCenterPosition, timing.stepFraction);
    assignSphericalInterpolation(stepCenterRotation, center.oldFrameCenterRotation, center.frameCenterRotation, timing.stepFraction);
    normalizeQuaternionInPlace(stepCenterRotation);
    const worldScale = WORLD_SCALE;
    assignInterpolation(worldScale, center.oldFrameCenterScale, center.frameCenterScale, timing.stepFraction);
    assignDifference(center.stepCenterShift, center.stepCenterPosition, center.oldStepCenterPosition);
    assignRotationFromTo(center.stepCenterShiftRotation, center.oldStepCenterRotation, stepCenterRotation);
    const stepAngle = rotationAngle(center.oldStepCenterRotation, stepCenterRotation);

    // Local inertia holds back part of the center's step motion; the inertia shift and rotation are the parts that
    // still move the particles along. The held-back part never moves faster than the local speed limits.
    const inertia = parameters.inertia;
    let localMovementInertia = subtract(1, inertia.localInertia);
    let localRotationInertia = subtract(1, inertia.localInertia);
    const heldBackShift = HELD_BACK_SHIFT;
    const heldBackShare = subtract(1, localMovementInertia);
    heldBackShift[0] = multiply(center.stepCenterShift[0], heldBackShare);
    heldBackShift[1] = multiply(center.stepCenterShift[1], heldBackShare);
    heldBackShift[2] = multiply(center.stepCenterShift[2], heldBackShare);
    const localSpeed = divide(length(heldBackShift), simulationDeltaTime);
    if (localSpeed > inertia.localMovementSpeedLimit && inertia.localMovementSpeedLimit >= 0) {
      localMovementInertia = interpolate(1, localMovementInertia, divide(inertia.localMovementSpeedLimit, localSpeed));
    }
    const localAngleSpeed = toDegrees(divide(multiply(stepAngle, subtract(1, localRotationInertia)), simulationDeltaTime));
    if (localAngleSpeed > inertia.localRotationSpeedLimit && inertia.localRotationSpeedLimit >= 0) {
      localRotationInertia = interpolate(1, localRotationInertia, divide(inertia.localRotationSpeedLimit, localAngleSpeed));
    }
    center.stepMovementInertia = localMovementInertia;
    center.stepRotationInertia = localRotationInertia;
    assignInterpolation(center.stepInertiaShift, ZERO, center.stepCenterShift, localMovementInertia);
    assignSphericalInterpolation(center.stepInertiaRotation, IDENTITY_ROTATION, center.stepCenterShiftRotation, localRotationInertia);

    center.angularVelocity = divide(stepAngle, simulationDeltaTime);
    if (center.angularVelocity > EPSILON) assignRotationAxis(center.rotationAxis, center.stepCenterShiftRotation);
    else assignVector(center.rotationAxis, ZERO);
    timing.worldScaleRatio = maximum(divide(length(worldScale), length(timing.restScale)), fround(1e-6));

    // 1 when the center keeps its rest orientation to gravity, 0 when turned upside down.
    let gravityAlignment = 1;
    const gravityDirection = parameters.worldGravityDirection;
    if (lengthSquared(gravityDirection) > EPSILON) {
      // The rest gravity direction, rotateVector(stepCenterRotation, restLocalGravityDirection), goes to SCRATCH[4..6].
      const restLocalGravityDirection = center.restLocalGravityDirection;
      SCRATCH[0] = stepCenterRotation[0];
      SCRATCH[1] = stepCenterRotation[1];
      SCRATCH[2] = stepCenterRotation[2];
      SCRATCH[3] = stepCenterRotation[3];
      SCRATCH[4] = restLocalGravityDirection[0];
      SCRATCH[5] = restLocalGravityDirection[1];
      SCRATCH[6] = restLocalGravityDirection[2];
      rotateVectorInto(SCRATCH, 0, SCRATCH, 4, SCRATCH, 4);
      const alignment = add(
        add(multiply(SCRATCH[4], gravityDirection[0]), multiply(SCRATCH[5], gravityDirection[1])),
        multiply(SCRATCH[6], gravityDirection[2]),
      );
      gravityAlignment = saturate(add(multiply(alignment, 0.5), 0.5));
    }
    timing.gravityAlignment = gravityAlignment;
    timing.gravityFalloffRatio =
      parameters.gravity > fround(1e-6) && parameters.gravityFalloff > fround(1e-6)
        ? interpolate(saturate(subtract(1, parameters.gravityFalloff)), 1, saturate(subtract(1, gravityAlignment)))
        : 1;

    if (timing.settleWeight < 1) {
      const addedWeight = parameters.settleTime > fround(1e-6) ? divide(simulationDeltaTime, parameters.settleTime) : 1;
      timing.settleWeight = saturate(add(timing.settleWeight, addedWeight));
    }
    timing.influenceWeight = saturate(multiply(multiply(timing.settleWeight, parameters.influenceWeight), timing.fadeWeight));
  }

  solveMotion(): void {
    const mesh = this.mesh;
    const attributes = mesh.attributes;
    const parameters = this.parameters;
    const motion = parameters.motion;
    if (!motion.useMaxDistance && !motion.useBehindLimit) return;

    for (let particle = 0; particle < this.particleCount; particle++) {
      const attribute = attributes[particle];
      if (!isSimulated(attribute) || attribute & Attribute.SkipMotionLimit) continue;
      const originalPosition = vectorAt(this.nextPositions, particle);
      const basePosition = vectorAt(this.basePositions, particle);
      let nextPosition = originalPosition;
      const particleRadius = maximum(evaluateCurve(parameters.radiusCurve, mesh.depths[particle]), fround(0.0001));
      // The motion curves are sampled at the squared depth.
      const squaredDepth = multiply(mesh.depths[particle], mesh.depths[particle]);
      const behindLimitDirection = rotateVector(quaternionAt(this.baseRotations, particle), NORMAL_AXES[motion.behindLimitAxis]);

      // Max distance: the particle stays within the curve's distance of its base pose.
      if (motion.useMaxDistance)
        nextPosition = addVectors(
          basePosition,
          clampVectorLength(subtractVectors(nextPosition, basePosition), evaluateCurve(motion.maxDistanceCurve, squaredDepth)),
        );

      // Behind limit: a sphere behind the base pose, opposite the limit's direction, that pushes a particle inside it
      // out to its surface.
      if (motion.useBehindLimit && motion.behindLimitRadius > 0) {
        const behindLimitDistance = evaluateCurve(motion.behindLimitDistanceCurve, squaredDepth);
        const sphereCenter = addVectors(basePosition, scaleVector(negateVector(behindLimitDirection), add(behindLimitDistance, motion.behindLimitRadius)));
        const offset = subtractVectors(nextPosition, sphereCenter);
        const offsetLength = length(offset);
        if (offsetLength > EPSILON && offsetLength < add(motion.behindLimitRadius, particleRadius) && offsetLength < motion.behindLimitRadius) {
          nextPosition = addVectors(sphereCenter, scaleVector(divideVector(offset, offsetLength), motion.behindLimitRadius));
        }
      }

      nextPosition = interpolateVectors(originalPosition, nextPosition, motion.stiffness);
      // Moving the velocity origin with most of the correction keeps that part from turning into velocity.
      writeVector(
        this.velocityOrigins,
        particle,
        addVectors(vectorAt(this.velocityOrigins, particle), scaleVector(subtractVectors(nextPosition, originalPosition), fround(0.95))),
      );
      writeVector(this.nextPositions, particle, nextPosition);
    }
  }

  endFrame(): void {
    const timing = this.timing;
    const center = this.center;
    this.outputFrame++;
    assignVector(center.oldAnchorWorldPosition, center.anchorWorldPosition);
    assignQuaternion(center.oldAnchorWorldRotation, center.anchorWorldRotation);
    assignVector(center.oldAnchorWorldScale, center.anchorWorldScale);
    if (timing.running) {
      assignVector(center.oldFrameCenterPosition, center.frameCenterPosition);
      assignQuaternion(center.oldFrameCenterRotation, center.frameCenterRotation);
      assignVector(center.oldFrameCenterScale, center.frameCenterScale);
      timing.forceMode = 0;
      assignVector(timing.pendingForce, ZERO);
      timing.skippedSteps = 0;
    }
    timing.reset = false;
    timing.timeReset = false;
    timing.running = false;
    timing.teleportShift = false;
    timing.anchorShifted = false;

    // Past two hours every clock moves back one hour, so Float32 times keep their precision.
    if (timing.time <= 7200) return;
    timing.time = subtract(timing.time, 3600);
    timing.oldTime = subtract(timing.oldTime, 3600);
    timing.stepTime = subtract(timing.stepTime, 3600);
    timing.oldStepTime = subtract(timing.oldStepTime, 3600);
    timing.intervalEndTime = subtract(timing.intervalEndTime, 3600);
    timing.intervalStartTime = subtract(timing.intervalStartTime, 3600);
  }
}
