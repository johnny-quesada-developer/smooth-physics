// The per-particle solver steps. Every operation is rounded to Float32, so results match the recorded golden traces
// bit for bit; scripts/generate-unrounded-solver.ts derives the unrounded kernels of 'default' precision.
//
// Helpers return vectors and quaternions through module scratch arrays instead of new arrays, so the steps allocate
// nothing. Read a result right after the call that writes it: the next helper call overwrites it.
import { evaluateCurve, type SampledCurve } from './curves.ts';
import { LOOK_ROTATION, lookRotationAt, rebuildRotationAt } from './float32/look-rotation.ts';
import type { Vector3 } from './float32/vector.ts';
import type { ColliderWork } from './collision.ts';
import { isSimulated, isExcluded, isNotSimulated, Attribute, VOLUME_SIGN } from './cloth-mesh/attributes.ts';
import type { SimulatedCloth } from './simulated-cloth.ts';
import type { PoseSource, FrequencyScale, ClothCollider } from './cloth-state.ts';

const { fround } = Math;

// Vector results go to RESULT[0..2], quaternion results to RESULT[4..7]. Helpers pass inputs to the helpers they call
// in the other entries.
const RESULT = new Float64Array(16);
const EPSILON = fround(1e-8);
const LARGEST_DISTANCE = fround(3.4028234663852886e38);

const sqrt = (value: number): number => fround(Math.sqrt(value));
const clampSigned = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value);
const saturate = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const dot = (leftX: number, leftY: number, leftZ: number, rightX: number, rightY: number, rightZ: number): number =>
  fround(fround(fround(leftX * rightX) + fround(leftY * rightY)) + fround(leftZ * rightZ));
const interpolate = (from: number, to: number, amount: number): number => fround(from + fround(amount * fround(to - from)));
const evaluateUnitCurve = (curve: SampledCurve, time: number): number => saturate(evaluateCurve(curve, time));

// Writes left × right into RESULT[0..2].
function cross(leftX: number, leftY: number, leftZ: number, rightX: number, rightY: number, rightZ: number): void {
  RESULT[0] = fround(fround(leftY * rightZ) - fround(leftZ * rightY));
  RESULT[1] = fround(fround(leftZ * rightX) - fround(leftX * rightZ));
  RESULT[2] = fround(fround(leftX * rightY) - fround(leftY * rightX));
}

// Inputs computed on the spot, for the helpers that read their inputs from arrays. Helpers never write it.
const INPUT = new Float64Array(32);
const IDENTITY = new Float64Array([0, 0, 0, 1]);

// Writes the vector at vectors[vectorOffset..] rotated by the quaternion at rotations[rotationOffset..] into
// RESULT[0..2]. It takes arrays and offsets instead of numbers, which V8 would box when it does not inline the call.
function rotateVectorAt(rotations: Float64Array, rotationOffset: number, vectors: Float64Array, vectorOffset: number): void {
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
  RESULT[0] = fround(fround(vectorX + fround(twiceCrossX * rotationW)) + fround(fround(rotationY * twiceCrossZ) - fround(rotationZ * twiceCrossY)));
  RESULT[1] = fround(fround(vectorY + fround(twiceCrossY * rotationW)) + fround(fround(rotationZ * twiceCrossX) - fround(rotationX * twiceCrossZ)));
  RESULT[2] = fround(fround(vectorZ + fround(twiceCrossZ * rotationW)) + fround(fround(rotationX * twiceCrossY) - fround(rotationY * twiceCrossX)));
}

// Writes left * right, read from left[leftOffset..] and right[rightOffset..], into RESULT[4..7].
function multiplyQuaternionsAt(left: Float64Array, leftOffset: number, right: Float64Array, rightOffset: number): void {
  const leftX = left[leftOffset];
  const leftY = left[leftOffset + 1];
  const leftZ = left[leftOffset + 2];
  const leftW = left[leftOffset + 3];
  const rightX = right[rightOffset];
  const rightY = right[rightOffset + 1];
  const rightZ = right[rightOffset + 2];
  const rightW = right[rightOffset + 3];
  RESULT[4] = fround(fround(fround(leftW * rightX) + fround(fround(leftX * rightW) + fround(leftY * rightZ))) - fround(leftZ * rightY));
  RESULT[5] = fround(fround(fround(leftW * rightY) + fround(fround(leftY * rightW) + fround(leftZ * rightX))) - fround(leftX * rightZ));
  RESULT[6] = fround(fround(fround(leftW * rightZ) + fround(fround(leftZ * rightW) + fround(leftX * rightY))) - fround(leftY * rightX));
  RESULT[7] = fround(fround(fround(leftW * rightW) + -fround(fround(leftX * rightX) + fround(leftY * rightY))) - fround(leftZ * rightZ));
}

// Writes the inverse of the quaternion at values[offset..] into RESULT[4..7].
function invertQuaternionAt(values: Float64Array, offset: number): void {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const inverseLengthSquared = fround(1 / fround(fround(fround(fround(x * x) + fround(y * y)) + fround(z * z)) + fround(w * w)));
  RESULT[4] = -fround(inverseLengthSquared * x);
  RESULT[5] = -fround(inverseLengthSquared * y);
  RESULT[6] = -fround(inverseLengthSquared * z);
  RESULT[7] = fround(inverseLengthSquared * w);
}

// Writes the unit quaternion of the one at values[offset..] into RESULT[4..7].
function normalizeQuaternionAt(values: Float64Array, offset: number): void {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const inverseLength = fround(1 / sqrt(fround(fround(fround(fround(x * x) + fround(y * y)) + fround(z * z)) + fround(w * w))));
  RESULT[4] = fround(inverseLength * x);
  RESULT[5] = fround(inverseLength * y);
  RESULT[6] = fround(inverseLength * z);
  RESULT[7] = fround(inverseLength * w);
}

// Writes the unit vector of the one at values[offset..] into RESULT[0..2].
function normalizeAt(values: Float64Array, offset: number): void {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const inverseLength = fround(1 / sqrt(dot(x, y, z, x, y, z)));
  RESULT[0] = fround(x * inverseLength);
  RESULT[1] = fround(y * inverseLength);
  RESULT[2] = fround(z * inverseLength);
}

// Writes the rotation by the angle at values[offset + 3] around the axis at values[offset..offset + 2], which need not
// be unit length, into RESULT[4..7].
function rotationAroundAxisAt(values: Float64Array, offset: number): void {
  const axisX = values[offset];
  const axisY = values[offset + 1];
  const axisZ = values[offset + 2];
  const angle = values[offset + 3];
  const inverseLength = fround(1 / sqrt(dot(axisX, axisY, axisZ, axisX, axisY, axisZ)));
  const unitX = fround(axisX * inverseLength);
  const unitY = fround(axisY * inverseLength);
  const unitZ = fround(axisZ * inverseLength);

  const halfAngle = fround(0.5 * angle);
  const sine = fround(Math.sin(halfAngle));
  const cosine = fround(Math.cos(halfAngle));
  RESULT[4] = fround(unitX * sine);
  RESULT[5] = fround(unitY * sine);
  RESULT[6] = fround(unitZ * sine);
  RESULT[7] = cosine;
}

// Writes the fraction at values[offset + 6] of the rotation from the unit direction at values[offset..offset + 2] to
// the one at values[offset + 3..offset + 5] into RESULT[4..7].
function fromToRotationAt(values: Float64Array, offset: number): void {
  const fromX = values[offset];
  const fromY = values[offset + 1];
  const fromZ = values[offset + 2];
  const toX = values[offset + 3];
  const toY = values[offset + 4];
  const toZ = values[offset + 5];
  const fraction = values[offset + 6];
  const cosine = clampSigned(dot(fromX, fromY, fromZ, toX, toY, toZ));
  let angle = fround(Math.acos(cosine));
  cross(fromX, fromY, fromZ, toX, toY, toZ);

  if (Math.abs(fround(1 + cosine)) < fround(1e-6)) {
    // Opposite directions: any perpendicular axis works, so take one that is not parallel to the start direction.
    angle = fround(Math.PI);
    if (fromX > fromY && fromX > fromZ) cross(fromX, fromY, fromZ, 0, 1, 0);
    else cross(fromX, fromY, fromZ, 1, 0, 0);
  } else if (Math.abs(fround(1 - cosine)) < fround(1e-6)) {
    RESULT[4] = 0;
    RESULT[5] = 0;
    RESULT[6] = 0;
    RESULT[7] = 1;
    return;
  }

  // The axis is in RESULT[0..2]; the angle goes right after it.
  RESULT[3] = fround(angle * fraction);
  rotationAroundAxisAt(RESULT, 0);
}

function angleBetween(firstX: number, firstY: number, firstZ: number, secondX: number, secondY: number, secondZ: number): number {
  const firstLength = sqrt(dot(firstX, firstY, firstZ, firstX, firstY, firstZ));
  const secondLength = sqrt(dot(secondX, secondY, secondZ, secondX, secondY, secondZ));
  return fround(Math.acos(clampSigned(fround(dot(firstX, firstY, firstZ, secondX, secondY, secondZ) / fround(firstLength * secondLength)))));
}

// Writes a vector or quaternion into a flat buffer, starting at offset.
function setVector(buffer: Float64Array, offset: number, x: number, y: number, z: number): void {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = z;
}

function setQuaternion(buffer: Float64Array, offset: number, x: number, y: number, z: number, w: number): void {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = z;
  buffer[offset + 3] = w;
}

// Per-particle values that stay constant through a call. Depths never change, but a curve may be replaced or edited
// between frames, so a cached curve is reused only while its 16 samples are unchanged.
type CurveSlot = { readonly samples: Float64Array; readonly values: Float64Array; filled: boolean };
type ParticleScratch = { readonly curves: CurveSlot[]; readonly buffers: Float64Array[] };
const scratches = new WeakMap<SimulatedCloth, ParticleScratch>();

function scratchOf(simulation: SimulatedCloth): ParticleScratch {
  let scratch = scratches.get(simulation);
  if (!scratch) {
    scratch = { curves: [], buffers: [] };
    scratches.set(simulation, scratch);
  }
  return scratch;
}

// Fixed-point conversion for FixedPointAccumulator (collision.ts); Math.fround keeps Float32 rounding in both variants.
const FIXED_POINT_SCALE = Math.fround(0.000001);
const toFixedPoint = (value: number): number => Math.trunc(Math.fround(value * 1000000)) | 0;

const CURVE_DISTANCE = 0;
const CURVE_DAMPING = 1;
const CURVE_RADIUS = 2;
const CURVE_RESTORATION = 3;
const CURVE_LIMIT = 4;

// The curve evaluated at every particle's depth.
function depthCurve(simulation: SimulatedCloth, slot: number, curve: SampledCurve, saturated: boolean): Float64Array {
  const curves = scratchOf(simulation).curves;
  const count = simulation.particleCount;
  let entry = curves[slot];
  if (!entry) curves[slot] = entry = { samples: new Float64Array(16), values: new Float64Array(count), filled: false };

  let unchanged = entry.filled;
  for (let sample = 0; unchanged && sample < 16; sample++) if (!Object.is(entry.samples[sample], curve[sample])) unchanged = false;
  if (unchanged) return entry.values;

  const depths = simulation.mesh.depths;
  const values = entry.values;
  for (let particle = 0; particle < count; particle++)
    values[particle] = saturated ? evaluateUnitCurve(curve, depths[particle]) : evaluateCurve(curve, depths[particle]);
  for (let sample = 0; sample < 16; sample++) entry.samples[sample] = curve[sample];
  entry.filled = true;
  return values;
}

const NO_VALUES = new Float64Array(0);
const BUFFER_MASS = 0;
const BUFFER_NEIGHBOR_MASS = 1;

function particleBuffer(simulation: SimulatedCloth, slot: number): Float64Array {
  const buffers = scratchOf(simulation).buffers;
  return buffers[slot] ?? (buffers[slot] = new Float64Array(simulation.particleCount));
}

export function solveDistance(simulation: SimulatedCloth, frequencyScale: FrequencyScale): void {
  const mesh = simulation.mesh;
  const attributes = mesh.attributes;
  const depths = mesh.depths;
  const distanceData = simulation.distanceData;
  const parameters = simulation.parameters;
  const nextPositions = simulation.nextPositions;
  const velocityOrigins = simulation.velocityOrigins;
  const basePositions = simulation.basePositions;
  const frictions = simulation.frictions;
  const restLengthScale = fround(simulation.timing.restScale[0] * simulation.timing.worldScaleRatio);
  const animationBlend = parameters.animationBlend;
  // A particle that does not move weighs as much as 50 free ones to its neighbors.
  const fixedInverseMass = fround(1 / fround(50));
  const velocityDamping = parameters.distance.velocityDamping;

  // Friction and closeness to the root make a particle heavier, so it gives way less to its links.
  const inverseMassOf = (friction: number, depth: number): number => {
    let mass = fround(1 + fround(friction * fround(3)));
    const rootCloseness = fround(1 - depth);
    mass = fround(mass + fround(fround(rootCloseness * rootCloseness) * fround(5)));
    return fround(1 / mass);
  };

  const particleCount = simulation.particleCount;
  const inverseMasses = particleBuffer(simulation, BUFFER_MASS);
  const neighborInverseMasses = particleBuffer(simulation, BUFFER_NEIGHBOR_MASS);
  const stiffnesses = depthCurve(simulation, CURVE_DISTANCE, parameters.distance.stiffnessCurve, true);
  const linkStarts = distanceData.start;
  const linkNeighbors = distanceData.data;
  const restDistances = distanceData.rest;
  const distanceFrequencyScale = frequencyScale[1];

  for (let particle = 0; particle < particleCount; particle++) {
    const inverseMass = inverseMassOf(frictions[particle], depths[particle]);
    inverseMasses[particle] = inverseMass;
    neighborInverseMasses[particle] = isNotSimulated(attributes[particle]) ? fixedInverseMass : inverseMass;
  }

  for (let particle = 0; particle < particleCount; particle++) {
    const attribute = attributes[particle];
    if (isExcluded(attribute) || isNotSimulated(attribute)) continue;
    const firstLink = linkStarts[particle];
    const endLink = linkStarts[particle + 1];
    const inverseMass = inverseMasses[particle];
    const stiffness = fround(stiffnesses[particle] * distanceFrequencyScale);
    if (endLink === firstLink) continue;

    // Positive rest distances mark vertical links (to the parent or a child), negative ones horizontal links, which
    // pull at half stiffness.
    const fullStiffness = saturate(stiffness);
    const halfStiffness = saturate(fround(stiffness * fround(0.5)));
    const particleOffset = particle * 3;
    const positionX = nextPositions[particleOffset];
    const positionY = nextPositions[particleOffset + 1];
    const positionZ = nextPositions[particleOffset + 2];
    let correctionX = 0;
    let correctionY = 0;
    let correctionZ = 0;
    let correctionCount = 0;

    for (let link = firstLink; link < endLink; link++) {
      const neighbor = linkNeighbors[link];
      const restDistance = restDistances[link];
      const linkStiffness = restDistance >= 0 ? fullStiffness : halfStiffness;
      const neighborOffset = neighbor * 3;
      const toNeighborX = fround(nextPositions[neighborOffset] - positionX);
      const toNeighborY = fround(nextPositions[neighborOffset + 1] - positionY);
      const toNeighborZ = fround(nextPositions[neighborOffset + 2] - positionZ);

      // A zero rest distance marks particles that coincide at rest: move halfway to the neighbor. This replaces the
      // corrections gathered so far instead of adding to them.
      if (restDistance === 0) {
        correctionX = fround(toNeighborX * 0.5);
        correctionY = fround(toNeighborY * 0.5);
        correctionZ = fround(toNeighborZ * 0.5);
        correctionCount++;
        continue;
      }

      const neighborInverseMass = neighborInverseMasses[neighbor];
      let restLength = fround(Math.abs(restDistance) * restLengthScale);
      // Interpolating toward the animated length by 0 changes nothing while the animated pose is finite.
      if (animationBlend !== 0) {
        const baseToNeighborX = fround(basePositions[neighborOffset] - basePositions[particleOffset]);
        const baseToNeighborY = fround(basePositions[neighborOffset + 1] - basePositions[particleOffset + 1]);
        const baseToNeighborZ = fround(basePositions[neighborOffset + 2] - basePositions[particleOffset + 2]);
        restLength = interpolate(
          restLength,
          sqrt(dot(baseToNeighborX, baseToNeighborY, baseToNeighborZ, baseToNeighborX, baseToNeighborY, baseToNeighborZ)),
          animationBlend,
        );
      }

      const distance = fround(
        Math.sqrt(fround(fround(fround(toNeighborX * toNeighborX) + fround(toNeighborY * toNeighborY)) + fround(toNeighborZ * toNeighborZ))),
      );
      if (distance < EPSILON) continue;

      // The particle takes its inverse-mass share of the stiffness-scaled stretch, along the link.
      const inverseDistance = fround(1 / distance);
      const stretch = fround(fround(distance - restLength) * linkStiffness);
      const inverseMassSum = fround(inverseMass + neighborInverseMass);
      correctionX = fround(correctionX + fround(fround(fround(fround(toNeighborX * inverseDistance) * stretch) / inverseMassSum) * inverseMass));
      correctionY = fround(correctionY + fround(fround(fround(fround(toNeighborY * inverseDistance) * stretch) / inverseMassSum) * inverseMass));
      correctionZ = fround(correctionZ + fround(fround(fround(fround(toNeighborZ * inverseDistance) * stretch) / inverseMassSum) * inverseMass));
      correctionCount++;
    }

    // Apply the average correction. Moving the velocity origin by part of it keeps that part from becoming velocity.
    if (correctionCount > 0) {
      correctionX = fround(correctionX / correctionCount);
      correctionY = fround(correctionY / correctionCount);
      correctionZ = fround(correctionZ / correctionCount);
      nextPositions[particleOffset] = fround(positionX + correctionX);
      nextPositions[particleOffset + 1] = fround(positionY + correctionY);
      nextPositions[particleOffset + 2] = fround(positionZ + correctionZ);
      velocityOrigins[particleOffset] = fround(velocityOrigins[particleOffset] + fround(correctionX * velocityDamping));
      velocityOrigins[particleOffset + 1] = fround(velocityOrigins[particleOffset + 1] + fround(correctionY * velocityDamping));
      velocityOrigins[particleOffset + 2] = fround(velocityOrigins[particleOffset + 2] + fround(correctionZ * velocityDamping));
    }
  }
}

// Angle limit and restoration along each chain, in three passes from root to tip. The methods share the
// chain's buffers, the link being solved and its corrections through fields instead of passing numbers to each other:
// V8 boxes every number that crosses a call it did not inline.
class AngleSolver {
  // Per particle: the step's positions and velocity origins, and the working rotation rebuilt from root to tip in
  // every pass. Recorded at the start of the step: the distance to the parent, the unit pose direction from the parent
  // in the parent's pose frame, the pose rotation relative to the parent and the pose vector from the parent.
  nextPositions: Float64Array = NO_VALUES;
  velocityOrigins: Float64Array = NO_VALUES;
  chainRotations: Float64Array = NO_VALUES;
  startLengths: number[] = [];
  localDirections: Float64Array = NO_VALUES;
  localRotations: Float64Array = NO_VALUES;
  restorationVectors: Float64Array = NO_VALUES;
  inverseMasses: Float64Array = NO_VALUES;
  limitDegrees: Float64Array = NO_VALUES;
  restorationStiffnesses: Float64Array = NO_VALUES;
  limitStiffness = 0;
  restorationFrequencyScale = 0;
  gravityFalloff = 0;
  velocityDamping = 0;
  restorationPivotRatio = 0;

  // The link being solved: the child and its parent, their offsets, whether they move, their inverse masses and their
  // positions, which the passes update as they move them.
  child = 0;
  childOffset = 0;
  parentOffset = 0;
  childRotationOffset = 0;
  parentRotationOffset = 0;
  childMoves = false;
  parentMoves = false;
  childInverseMass = 0;
  parentInverseMass = 0;
  childX = 0;
  childY = 0;
  childZ = 0;
  parentX = 0;
  parentY = 0;
  parentZ = 0;

  // The unit link direction that the parent's working rotation expects, which limitLink turns the link toward, and
  // the angle from it that the link turns to when it is past the limit.
  targetX = 0;
  targetY = 0;
  targetZ = 0;
  softenedLimit = 0;

  // What moveEnds moves the link's ends by: the link from the parent, the link turned to where it should point, the
  // pivot as a fraction of the link from the parent, and the share of each move that becomes velocity.
  toChildX = 0;
  toChildY = 0;
  toChildZ = 0;
  turnedX = 0;
  turnedY = 0;
  turnedZ = 0;
  pivotRatio = 0;
  velocityScale = 0;

  solve(simulation: SimulatedCloth, frequencyScale: FrequencyScale): void {
    const mesh = simulation.mesh;
    const attributes = mesh.attributes;
    const angleParameters = simulation.parameters.angle;
    if (!angleParameters.useAngleLimit && !angleParameters.useRestoration) return;

    const nextPositions = simulation.nextPositions;
    this.nextPositions = nextPositions;
    this.velocityOrigins = simulation.velocityOrigins;
    this.chainRotations = simulation.rotationBuffer;
    this.startLengths = simulation.lengthBuffer;
    this.localDirections = simulation.localPositionBuffer;
    this.localRotations = simulation.localRotationBuffer;
    this.restorationVectors = simulation.restorationVectors;
    this.gravityFalloff = interpolate(fround(1 - angleParameters.restorationGravityFalloff), 1, simulation.timing.gravityAlignment);
    this.limitStiffness = angleParameters.limitStiffness;
    this.velocityDamping = angleParameters.restorationVelocityDamping;
    this.restorationFrequencyScale = frequencyScale[3];

    const inverseMasses = particleBuffer(simulation, BUFFER_MASS);
    const frictions = simulation.frictions;
    for (let particle = 0; particle < simulation.particleCount; particle++) {
      inverseMasses[particle] = fround(1 / fround(1 + fround(frictions[particle] * fround(3))));
    }
    this.inverseMasses = inverseMasses;
    this.restorationStiffnesses = angleParameters.useRestoration
      ? depthCurve(simulation, CURVE_RESTORATION, angleParameters.restorationStiffnessCurve, true)
      : NO_VALUES;
    this.limitDegrees = angleParameters.useAngleLimit ? depthCurve(simulation, CURVE_LIMIT, angleParameters.limitCurve, false) : NO_VALUES;

    for (let chain = 0; chain < mesh.chainStart.length; chain++) {
      const chainStart = mesh.chainStart[chain];
      const chainLength = mesh.chainCount[chain];
      this.recordChain(simulation, chainStart, chainLength);

      for (let iteration = 0; iteration < 3; iteration++) {
        const iterationRatio = fround(iteration / 2);
        // The restoration pivot moves from near the parent toward the middle of the link over the passes.
        this.restorationPivotRatio = interpolate(fround(0.1), fround(0.5), iterationRatio);

        for (let chainPosition = 0; chainPosition < chainLength; chainPosition++) {
          const child = mesh.chainData[chainStart + chainPosition];
          if (!isSimulated(attributes[child])) continue;
          const parent = mesh.parentIndices[child];
          const childOffset = child * 3;
          const parentOffset = parent * 3;
          this.child = child;
          this.childOffset = childOffset;
          this.parentOffset = parentOffset;
          this.childRotationOffset = child * 4;
          this.parentRotationOffset = parent * 4;
          this.childMoves = isSimulated(attributes[child]);
          this.parentMoves = isSimulated(attributes[parent]);
          this.childInverseMass = inverseMasses[child];
          this.parentInverseMass = inverseMasses[parent];
          this.childX = nextPositions[childOffset];
          this.childY = nextPositions[childOffset + 1];
          this.childZ = nextPositions[childOffset + 2];
          this.parentX = nextPositions[parentOffset];
          this.parentY = nextPositions[parentOffset + 1];
          this.parentZ = nextPositions[parentOffset + 2];
          if (angleParameters.useAngleLimit) this.limitLink();
          if (angleParameters.useRestoration) this.restoreLink();
        }
      }
    }

    const startLengths = this.startLengths;
    const localDirections = this.localDirections;
    const restorationVectors = this.restorationVectors;
    for (let chain = 0; chain < mesh.chainStart.length; chain++) {
      for (let chainPosition = 0; chainPosition < mesh.chainCount[chain]; chainPosition++) {
        const particle = mesh.chainData[mesh.chainStart[chain] + chainPosition];
        startLengths[particle] = 0;
        setVector(localDirections, particle * 3, 0, 0, 0);
        setVector(restorationVectors, particle * 3, 0, 0, 0);
      }
    }
  }

  // Starts every working rotation of the chain at its pose rotation and records, for every link, what the passes
  // compare against.
  recordChain(simulation: SimulatedCloth, chainStart: number, chainLength: number): void {
    const mesh = simulation.mesh;
    const angleParameters = simulation.parameters.angle;
    const nextPositions = this.nextPositions;
    const stepPosePositions = simulation.stepPosePositions;
    const stepPoseRotations = simulation.stepPoseRotations;
    const chainRotations = this.chainRotations;
    const startLengths = this.startLengths;
    const localDirections = this.localDirections;
    const localRotations = this.localRotations;

    for (let chainPosition = 0; chainPosition < chainLength; chainPosition++) {
      const particle = mesh.chainData[chainStart + chainPosition];
      const rotationOffset = particle * 4;
      setQuaternion(
        chainRotations,
        rotationOffset,
        stepPoseRotations[rotationOffset],
        stepPoseRotations[rotationOffset + 1],
        stepPoseRotations[rotationOffset + 2],
        stepPoseRotations[rotationOffset + 3],
      );
      // The chain root has no parent to be relative to.
      if (chainPosition === 0) continue;

      const parent = mesh.parentIndices[particle];
      const particleOffset = particle * 3;
      const parentOffset = parent * 3;
      const parentRotationOffset = parent * 4;
      const poseVectorX = fround(stepPosePositions[particleOffset] - stepPosePositions[parentOffset]);
      const poseVectorY = fround(stepPosePositions[particleOffset + 1] - stepPosePositions[parentOffset + 1]);
      const poseVectorZ = fround(stepPosePositions[particleOffset + 2] - stepPosePositions[parentOffset + 2]);
      if (angleParameters.useAngleLimit) {
        const toParentX = fround(nextPositions[parentOffset] - nextPositions[particleOffset]);
        const toParentY = fround(nextPositions[parentOffset + 1] - nextPositions[particleOffset + 1]);
        const toParentZ = fround(nextPositions[parentOffset + 2] - nextPositions[particleOffset + 2]);
        const parentDistance = sqrt(dot(toParentX, toParentY, toParentZ, toParentX, toParentY, toParentZ));
        const poseLength = sqrt(dot(poseVectorX, poseVectorY, poseVectorZ, poseVectorX, poseVectorY, poseVectorZ));
        if (parentDistance < EPSILON || poseLength < EPSILON) {
          startLengths[particle] = 0;
          setVector(localDirections, particleOffset, 0, 0, 0);
          setQuaternion(localRotations, rotationOffset, 0, 0, 0, 1);
        } else {
          invertQuaternionAt(stepPoseRotations, parentRotationOffset);
          startLengths[particle] = parentDistance;
          INPUT[0] = fround(poseVectorX / poseLength);
          INPUT[1] = fround(poseVectorY / poseLength);
          INPUT[2] = fround(poseVectorZ / poseLength);
          rotateVectorAt(RESULT, 4, INPUT, 0);
          setVector(localDirections, particleOffset, RESULT[0], RESULT[1], RESULT[2]);
          multiplyQuaternionsAt(RESULT, 4, stepPoseRotations, rotationOffset);
          setQuaternion(localRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
        }
      }
      if (angleParameters.useRestoration) setVector(this.restorationVectors, particleOffset, poseVectorX, poseVectorY, poseVectorZ);
    }
  }

  // Keeps the link within the angle limit of the direction the parent's working rotation expects, then rebuilds the
  // child's working rotation from the parent's.
  limitLink(): void {
    const nextPositions = this.nextPositions;
    const velocityOrigins = this.velocityOrigins;
    const chainRotations = this.chainRotations;
    const childOffset = this.childOffset;
    const childX = this.childX;
    const childY = this.childY;
    const childZ = this.childZ;
    const parentX = this.parentX;
    const parentY = this.parentY;
    const parentZ = this.parentZ;
    let toChildX = fround(childX - parentX);
    let toChildY = fround(childY - parentY);
    let toChildZ = fround(childZ - parentZ);
    let linkLength = sqrt(dot(toChildX, toChildY, toChildZ, toChildX, toChildY, toChildZ));
    if (linkLength < EPSILON) return;

    // The link direction that the parent's working rotation expects.
    rotateVectorAt(chainRotations, this.parentRotationOffset, this.localDirections, childOffset);
    const targetX = RESULT[0];
    const targetY = RESULT[1];
    const targetZ = RESULT[2];
    const targetLength = sqrt(dot(targetX, targetY, targetZ, targetX, targetY, targetZ));
    // The link had no length at the start of the step: put the child back on its parent.
    if (targetLength < EPSILON) {
      const snapX = fround(parentX - childX);
      const snapY = fround(parentY - childY);
      const snapZ = fround(parentZ - childZ);
      nextPositions[childOffset] = parentX;
      nextPositions[childOffset + 1] = parentY;
      nextPositions[childOffset + 2] = parentZ;
      velocityOrigins[childOffset] = fround(velocityOrigins[childOffset] + snapX);
      velocityOrigins[childOffset + 1] = fround(velocityOrigins[childOffset + 1] + snapY);
      velocityOrigins[childOffset + 2] = fround(velocityOrigins[childOffset + 2] + snapZ);
      multiplyQuaternionsAt(chainRotations, this.parentRotationOffset, this.localRotations, this.childRotationOffset);
      setQuaternion(chainRotations, this.childRotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
      return;
    }

    toChildX = fround(toChildX / linkLength);
    toChildY = fround(toChildY / linkLength);
    toChildZ = fround(toChildZ / linkLength);
    this.targetX = fround(targetX / targetLength);
    this.targetY = fround(targetY / targetLength);
    this.targetZ = fround(targetZ / targetLength);
    // The link keeps the length halfway between its current one and the one at the start of the step. interpolate is
    // written out here and in turnWithinLimit: V8 inlines turnWithinLimit into limitLink and then runs out of inlining
    // budget, and the calls would box their numbers.
    const startLength = this.startLengths[this.child];
    linkLength = fround(linkLength + fround(0.5 * fround(startLength - linkLength)));
    if (startLength < EPSILON || linkLength < EPSILON) return;
    this.toChildX = fround(toChildX * linkLength);
    this.toChildY = fround(toChildY * linkLength);
    this.toChildZ = fround(toChildZ * linkLength);

    this.turnWithinLimit();
    this.pivotRatio = fround(0.4);
    this.velocityScale = fround(0.9);
    this.moveEnds();
    this.followLink();
  }

  // Sets the turned link to the link turned toward the target direction until it is only the softened limit away from
  // it, or to the link itself when it is within the limit.
  turnWithinLimit(): void {
    const toChildX = this.toChildX;
    const toChildY = this.toChildY;
    const toChildZ = this.toChildZ;
    const limitAngle = fround(this.limitDegrees[this.child] * fround(0.0174532925));
    const angle = angleBetween(toChildX, toChildY, toChildZ, this.targetX, this.targetY, this.targetZ);
    this.turnedX = toChildX;
    this.turnedY = toChildY;
    this.turnedZ = toChildZ;
    if (angle > limitAngle) {
      this.softenedLimit = fround(angle + fround(this.limitStiffness * fround(limitAngle - angle)));
      this.turnTowardTarget();
    }
  }

  // The steps of turnWithinLimit past the limit check. They follow fromToRotationAt, except that the fraction comes
  // from the angle before the opposite case sets it to pi.
  turnTowardTarget(): void {
    const toChildX = this.toChildX;
    const toChildY = this.toChildY;
    const toChildZ = this.toChildZ;
    const softenedLimit = this.softenedLimit;
    INPUT[0] = toChildX;
    INPUT[1] = toChildY;
    INPUT[2] = toChildZ;
    normalizeAt(INPUT, 0);
    const childDirectionX = RESULT[0];
    const childDirectionY = RESULT[1];
    const childDirectionZ = RESULT[2];
    INPUT[0] = this.targetX;
    INPUT[1] = this.targetY;
    INPUT[2] = this.targetZ;
    normalizeAt(INPUT, 0);
    const targetDirectionX = RESULT[0];
    const targetDirectionY = RESULT[1];
    const targetDirectionZ = RESULT[2];
    const cosine = clampSigned(dot(childDirectionX, childDirectionY, childDirectionZ, targetDirectionX, targetDirectionY, targetDirectionZ));
    let directionAngle = fround(Math.acos(cosine));
    if (directionAngle > softenedLimit) {
      const correctionFraction = fround(fround(directionAngle - softenedLimit) / directionAngle);
      cross(childDirectionX, childDirectionY, childDirectionZ, targetDirectionX, targetDirectionY, targetDirectionZ);
      let axisX = RESULT[0];
      let axisY = RESULT[1];
      let axisZ = RESULT[2];
      let shouldRotate = true;
      if (Math.abs(fround(1 + cosine)) < fround(1e-6)) {
        // Opposite directions: any perpendicular axis works, so take one that is not parallel to the link.
        directionAngle = fround(Math.PI);
        if (childDirectionX > childDirectionY && childDirectionX > childDirectionZ) cross(childDirectionX, childDirectionY, childDirectionZ, 0, 1, 0);
        else cross(childDirectionX, childDirectionY, childDirectionZ, 1, 0, 0);
        axisX = RESULT[0];
        axisY = RESULT[1];
        axisZ = RESULT[2];
      } else if (Math.abs(fround(1 - cosine)) < fround(1e-6)) shouldRotate = false;
      if (shouldRotate) {
        INPUT[0] = axisX;
        INPUT[1] = axisY;
        INPUT[2] = axisZ;
        INPUT[3] = fround(directionAngle * correctionFraction);
        rotationAroundAxisAt(INPUT, 0);
        INPUT[0] = toChildX;
        INPUT[1] = toChildY;
        INPUT[2] = toChildZ;
        rotateVectorAt(RESULT, 4, INPUT, 0);
        this.turnedX = RESULT[0];
        this.turnedY = RESULT[1];
        this.turnedZ = RESULT[2];
      }
    }
  }

  // The child's working rotation is the parent's times the recorded relative rotation, turned from the target
  // direction to the link's direction after moveEnds.
  followLink(): void {
    let toChildX = fround(this.childX - this.parentX);
    let toChildY = fround(this.childY - this.parentY);
    let toChildZ = fround(this.childZ - this.parentZ);
    const linkLength = sqrt(dot(toChildX, toChildY, toChildZ, toChildX, toChildY, toChildZ));
    if (linkLength < EPSILON) return;
    toChildX = fround(toChildX / linkLength);
    toChildY = fround(toChildY / linkLength);
    toChildZ = fround(toChildZ / linkLength);
    multiplyQuaternionsAt(this.chainRotations, this.parentRotationOffset, this.localRotations, this.childRotationOffset);
    // The inherited rotation waits in INPUT[8..11] while fromToRotationAt writes RESULT.
    INPUT[8] = RESULT[4];
    INPUT[9] = RESULT[5];
    INPUT[10] = RESULT[6];
    INPUT[11] = RESULT[7];
    INPUT[0] = this.targetX;
    INPUT[1] = this.targetY;
    INPUT[2] = this.targetZ;
    INPUT[3] = toChildX;
    INPUT[4] = toChildY;
    INPUT[5] = toChildZ;
    INPUT[6] = 1;
    fromToRotationAt(INPUT, 0);
    multiplyQuaternionsAt(RESULT, 4, INPUT, 8);
    setQuaternion(this.chainRotations, this.childRotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
  }

  // Turns the link part of the way back toward its pose direction.
  restoreLink(): void {
    const restorationVectors = this.restorationVectors;
    const childOffset = this.childOffset;
    const parentX = this.parentX;
    const parentY = this.parentY;
    const parentZ = this.parentZ;
    const childX = this.childX;
    const childY = this.childY;
    const childZ = this.childZ;
    const restorationLength = sqrt(
      dot(
        restorationVectors[childOffset],
        restorationVectors[childOffset + 1],
        restorationVectors[childOffset + 2],
        restorationVectors[childOffset],
        restorationVectors[childOffset + 1],
        restorationVectors[childOffset + 2],
      ),
    );
    // The pose puts the child on its parent: move it there.
    if (restorationLength < EPSILON) {
      const nextPositions = this.nextPositions;
      const velocityOrigins = this.velocityOrigins;
      const snapX = fround(parentX - childX);
      const snapY = fround(parentY - childY);
      const snapZ = fround(parentZ - childZ);
      nextPositions[childOffset] = parentX;
      nextPositions[childOffset + 1] = parentY;
      nextPositions[childOffset + 2] = parentZ;
      velocityOrigins[childOffset] = fround(velocityOrigins[childOffset] + snapX);
      velocityOrigins[childOffset + 1] = fround(velocityOrigins[childOffset + 1] + snapY);
      velocityOrigins[childOffset + 2] = fround(velocityOrigins[childOffset + 2] + snapZ);
      return;
    }

    const toChildX = fround(childX - parentX);
    const toChildY = fround(childY - parentY);
    const toChildZ = fround(childZ - parentZ);
    const linkLength = sqrt(dot(toChildX, toChildY, toChildZ, toChildX, toChildY, toChildZ));
    if (linkLength < EPSILON) return;

    let restorationStiffness = this.restorationStiffnesses[this.child];
    restorationStiffness = fround(saturate(fround(restorationStiffness * this.restorationFrequencyScale)) * this.gravityFalloff);
    INPUT[0] = fround(toChildX / linkLength);
    INPUT[1] = fround(toChildY / linkLength);
    INPUT[2] = fround(toChildZ / linkLength);
    INPUT[3] = fround(restorationVectors[childOffset] / restorationLength);
    INPUT[4] = fround(restorationVectors[childOffset + 1] / restorationLength);
    INPUT[5] = fround(restorationVectors[childOffset + 2] / restorationLength);
    INPUT[6] = restorationStiffness;
    fromToRotationAt(INPUT, 0);
    INPUT[0] = toChildX;
    INPUT[1] = toChildY;
    INPUT[2] = toChildZ;
    rotateVectorAt(RESULT, 4, INPUT, 0);
    this.toChildX = toChildX;
    this.toChildY = toChildY;
    this.toChildZ = toChildZ;
    this.turnedX = RESULT[0];
    this.turnedY = RESULT[1];
    this.turnedZ = RESULT[2];
    this.pivotRatio = this.restorationPivotRatio;
    this.velocityScale = this.velocityDamping;
    this.moveEnds();
  }

  // Parent and child turn their link around a pivot at pivotRatio of the way from parent to child, until it points
  // along the turned link. Each end moves toward its place by its inverse mass, and an end that moves adds
  // velocityScale of its move to its velocity origin.
  moveEnds(): void {
    const nextPositions = this.nextPositions;
    const velocityOrigins = this.velocityOrigins;
    const pivotRatio = this.pivotRatio;
    const velocityScale = this.velocityScale;
    const childOffset = this.childOffset;
    const parentOffset = this.parentOffset;
    const childX = this.childX;
    const childY = this.childY;
    const childZ = this.childZ;
    const parentX = this.parentX;
    const parentY = this.parentY;
    const parentZ = this.parentZ;
    const turnedX = this.turnedX;
    const turnedY = this.turnedY;
    const turnedZ = this.turnedZ;
    const pivotX = fround(parentX + fround(this.toChildX * pivotRatio));
    const pivotY = fround(parentY + fround(this.toChildY * pivotRatio));
    const pivotZ = fround(parentZ + fround(this.toChildZ * pivotRatio));
    const pivotToChildRatio = fround(1 - pivotRatio);
    const parentCorrectionX = fround(fround(fround(pivotX - fround(turnedX * pivotRatio)) - parentX) * this.parentInverseMass);
    const parentCorrectionY = fround(fround(fround(pivotY - fround(turnedY * pivotRatio)) - parentY) * this.parentInverseMass);
    const parentCorrectionZ = fround(fround(fround(pivotZ - fround(turnedZ * pivotRatio)) - parentZ) * this.parentInverseMass);
    const childCorrectionX = fround(fround(fround(pivotX + fround(turnedX * pivotToChildRatio)) - childX) * this.childInverseMass);
    const childCorrectionY = fround(fround(fround(pivotY + fround(turnedY * pivotToChildRatio)) - childY) * this.childInverseMass);
    const childCorrectionZ = fround(fround(fround(pivotZ + fround(turnedZ * pivotToChildRatio)) - childZ) * this.childInverseMass);
    if (this.childMoves) {
      const movedX = fround(childX + childCorrectionX);
      const movedY = fround(childY + childCorrectionY);
      const movedZ = fround(childZ + childCorrectionZ);
      this.childX = movedX;
      this.childY = movedY;
      this.childZ = movedZ;
      nextPositions[childOffset] = movedX;
      nextPositions[childOffset + 1] = movedY;
      nextPositions[childOffset + 2] = movedZ;
      velocityOrigins[childOffset] = fround(velocityOrigins[childOffset] + fround(childCorrectionX * velocityScale));
      velocityOrigins[childOffset + 1] = fround(velocityOrigins[childOffset + 1] + fround(childCorrectionY * velocityScale));
      velocityOrigins[childOffset + 2] = fround(velocityOrigins[childOffset + 2] + fround(childCorrectionZ * velocityScale));
    }
    if (this.parentMoves) {
      const movedX = fround(parentX + parentCorrectionX);
      const movedY = fround(parentY + parentCorrectionY);
      const movedZ = fround(parentZ + parentCorrectionZ);
      this.parentX = movedX;
      this.parentY = movedY;
      this.parentZ = movedZ;
      nextPositions[parentOffset] = movedX;
      nextPositions[parentOffset + 1] = movedY;
      nextPositions[parentOffset + 2] = movedZ;
      velocityOrigins[parentOffset] = fround(velocityOrigins[parentOffset] + fround(parentCorrectionX * velocityScale));
      velocityOrigins[parentOffset + 1] = fround(velocityOrigins[parentOffset + 1] + fround(parentCorrectionY * velocityScale));
      velocityOrigins[parentOffset + 2] = fround(velocityOrigins[parentOffset + 2] + fround(parentCorrectionZ * velocityScale));
    }
  }
}

const ANGLE_SOLVER = new AngleSolver();

export function solveAngle(simulation: SimulatedCloth, frequencyScale: FrequencyScale): void {
  ANGLE_SOLVER.solve(simulation, frequencyScale);
}

// The ratio along the segment of its point closest to the given point.
const closestRatioOnSegment = (
  pointX: number,
  pointY: number,
  pointZ: number,
  segmentStartX: number,
  segmentStartY: number,
  segmentStartZ: number,
  segmentEndX: number,
  segmentEndY: number,
  segmentEndZ: number,
): number => {
  const segmentDirectionX = fround(segmentEndX - segmentStartX);
  const segmentDirectionY = fround(segmentEndY - segmentStartY);
  const segmentDirectionZ = fround(segmentEndZ - segmentStartZ);
  const lengthSquared = dot(segmentDirectionX, segmentDirectionY, segmentDirectionZ, segmentDirectionX, segmentDirectionY, segmentDirectionZ);
  if (lengthSquared === 0) return 0;
  return saturate(
    fround(
      dot(
        fround(pointX - segmentStartX),
        fround(pointY - segmentStartY),
        fround(pointZ - segmentStartZ),
        segmentDirectionX,
        segmentDirectionY,
        segmentDirectionZ,
      ) / lengthSquared,
    ),
  );
};
const boundsOverlap = (boxMinimum: readonly number[], boxMaximum: readonly number[], colliderWork: ColliderWork): boolean =>
  boxMaximum[0] >= colliderWork.bounds.minimum[0] &&
  boxMaximum[1] >= colliderWork.bounds.minimum[1] &&
  boxMaximum[2] >= colliderWork.bounds.minimum[2] &&
  boxMinimum[0] <= colliderWork.bounds.maximum[0] &&
  boxMinimum[1] <= colliderWork.bounds.maximum[1] &&
  boxMinimum[2] <= colliderWork.bounds.maximum[2];

// Edge collision for surfaces: every edge between two particles against the cloth's colliders. The methods share the
// edge, the collider segment and the contact through fields instead of passing numbers to each other: V8 boxes every
// number that crosses a call it did not inline, and these calls run for every edge and collider in every step.
class EdgeCollision {
  // The edge: its two ends, their radii, and the gap within which a collider still adds friction.
  edgeStartX = 0;
  edgeStartY = 0;
  edgeStartZ = 0;
  edgeEndX = 0;
  edgeEndY = 0;
  edgeEndZ = 0;
  edgeStartRadius = 0;
  edgeEndRadius = 0;
  frictionRange = 0;
  // The edge's bounding box, grown by the end radii and the friction range.
  readonly boxMinimum = [0, 0, 0];
  readonly boxMaximum = [0, 0, 0];

  // The segment that closestPointsToSegment measures the edge against: a capsule's axis.
  segmentStartX = 0;
  segmentStartY = 0;
  segmentStartZ = 0;
  segmentEndX = 0;
  segmentEndY = 0;
  segmentEndZ = 0;

  // The closest points between the edge and the segment: the ratio along each, the point on each and their squared
  // distance. resolveContact reads edgeRatio as the edge point in contact.
  edgeRatio = 0;
  segmentRatio = 0;
  edgePointX = 0;
  edgePointY = 0;
  edgePointZ = 0;
  segmentPointX = 0;
  segmentPointY = 0;
  segmentPointZ = 0;
  squaredDistance = 0;

  // The contact with one collider: the distance to its surface (negative inside), the edge ends pushed out of it and
  // the normal. distanceAlongNormal and thickness are what resolveContact compares.
  distance = 0;
  pushedStartX = 0;
  pushedStartY = 0;
  pushedStartZ = 0;
  pushedEndX = 0;
  pushedEndY = 0;
  pushedEndZ = 0;
  normalX = 0;
  normalY = 0;
  normalZ = 0;
  distanceAlongNormal = 0;
  thickness = 0;

  readonly push: Vector3 = [0, 0, 0];

  solve(simulation: SimulatedCloth): void {
    const mesh = simulation.mesh;
    const attributes = mesh.attributes;
    const parameters = simulation.parameters;
    const accumulator = simulation.accumulator;
    const nextPositions = simulation.nextPositions;
    const worldScaleRatio = simulation.timing.worldScaleRatio;
    const boxMinimum = this.boxMinimum;
    const boxMaximum = this.boxMaximum;
    const push = this.push;
    const activeColliders = nearColliders(simulation);
    const activeColliderCount = activeColliders.length;
    const edges = mesh.edges;
    const particleRadii = depthCurve(simulation, CURVE_RADIUS, parameters.radiusCurve, false);

    for (let edge = 0; edge < edges.length; edge++) {
      const edgeParticles = edges[edge];
      const startParticle = edgeParticles[0];
      const endParticle = edgeParticles[1];
      const startMoves = isSimulated(attributes[startParticle]);
      const endMoves = isSimulated(attributes[endParticle]);
      if (!startMoves && !endMoves) continue;

      const startOffset = startParticle * 3;
      const endOffset = endParticle * 3;
      const edgeStartX = nextPositions[startOffset];
      const edgeStartY = nextPositions[startOffset + 1];
      const edgeStartZ = nextPositions[startOffset + 2];
      const edgeEndX = nextPositions[endOffset];
      const edgeEndY = nextPositions[endOffset + 1];
      const edgeEndZ = nextPositions[endOffset + 2];
      const startRadius = fround(particleRadii[startParticle] * worldScaleRatio);
      const endRadius = fround(particleRadii[endParticle] * worldScaleRatio);
      // Colliders whose gap to the surface is at most this still add friction.
      const frictionRange = fround(fround(startRadius + endRadius) * 0.5);
      this.edgeStartX = edgeStartX;
      this.edgeStartY = edgeStartY;
      this.edgeStartZ = edgeStartZ;
      this.edgeEndX = edgeEndX;
      this.edgeEndY = edgeEndY;
      this.edgeEndZ = edgeEndZ;
      this.edgeStartRadius = startRadius;
      this.edgeEndRadius = endRadius;
      this.frictionRange = frictionRange;

      for (let axis = 0; axis < 3; axis++) {
        const startLower = fround(nextPositions[startOffset + axis] - startRadius);
        const endLower = fround(nextPositions[endOffset + axis] - endRadius);
        const startUpper = fround(nextPositions[startOffset + axis] + startRadius);
        const endUpper = fround(nextPositions[endOffset + axis] + endRadius);
        boxMinimum[axis] = fround((startLower < endLower ? startLower : endLower) - frictionRange);
        boxMaximum[axis] = fround((startUpper > endUpper ? startUpper : endUpper) + frictionRange);
      }

      let closestDistance = LARGEST_DISTANCE;
      let hasFrictionContact = false;
      let collisionNormalX = 0;
      let collisionNormalY = 0;
      let collisionNormalZ = 0;
      let startPushX = 0;
      let startPushY = 0;
      let startPushZ = 0;
      let endPushX = 0;
      let endPushY = 0;
      let endPushZ = 0;
      let pushCount = 0;
      let pushNormalX = 0;
      let pushNormalY = 0;
      let pushNormalZ = 0;
      for (let colliderIndex = 0; colliderIndex < activeColliderCount; colliderIndex++) {
        const collider = activeColliders[colliderIndex];
        const colliderWork = collider.work;
        if (!colliderWork) continue;
        this.detectContact(colliderWork, collider.type === 1);
        const distance = this.distance;
        if (distance <= 0) {
          startPushX = fround(startPushX + fround(this.pushedStartX - edgeStartX));
          startPushY = fround(startPushY + fround(this.pushedStartY - edgeStartY));
          startPushZ = fround(startPushZ + fround(this.pushedStartZ - edgeStartZ));
          endPushX = fround(endPushX + fround(this.pushedEndX - edgeEndX));
          endPushY = fround(endPushY + fround(this.pushedEndY - edgeEndY));
          endPushZ = fround(endPushZ + fround(this.pushedEndZ - edgeEndZ));
          pushNormalX = fround(pushNormalX + this.normalX);
          pushNormalY = fround(pushNormalY + this.normalY);
          pushNormalZ = fround(pushNormalZ + this.normalZ);
          pushCount++;
        }
        if (distance <= frictionRange) {
          hasFrictionContact = true;
          collisionNormalX = fround(collisionNormalX + this.normalX);
          collisionNormalY = fround(collisionNormalY + this.normalY);
          collisionNormalZ = fround(collisionNormalZ + this.normalZ);
          closestDistance = closestDistance < distance ? closestDistance : distance;
        }
      }

      // Scaling the average push by the average normal's length weakens it when colliders push from different sides.
      if (pushCount > 0) {
        pushNormalX = fround(pushNormalX / pushCount);
        pushNormalY = fround(pushNormalY / pushCount);
        pushNormalZ = fround(pushNormalZ / pushCount);
        const pushNormalLength = sqrt(dot(pushNormalX, pushNormalY, pushNormalZ, pushNormalX, pushNormalY, pushNormalZ));
        if (pushNormalLength > EPSILON) {
          const pushScale = pushNormalLength < 1 ? pushNormalLength : 1;
          push[0] = fround(fround(startPushX / pushCount) * pushScale);
          push[1] = fround(fround(startPushY / pushCount) * pushScale);
          push[2] = fround(fround(startPushZ / pushCount) * pushScale);
          accumulator.addVector(startParticle, push);
          push[0] = fround(fround(endPushX / pushCount) * pushScale);
          push[1] = fround(fround(endPushY / pushCount) * pushScale);
          push[2] = fround(fround(endPushZ / pushCount) * pushScale);
          accumulator.addVector(endParticle, push);
          simulation.stats.contacts++;
        }
      }

      if (
        hasFrictionContact &&
        frictionRange > 0 &&
        dot(collisionNormalX, collisionNormalY, collisionNormalZ, collisionNormalX, collisionNormalY, collisionNormalZ) > fround(1e-6)
      ) {
        // Full friction at contact, fading to none at the end of the friction range.
        const friction = fround(1 - saturate(fround(closestDistance / frictionRange)));
        INPUT[0] = collisionNormalX;
        INPUT[1] = collisionNormalY;
        INPUT[2] = collisionNormalZ;
        normalizeAt(INPUT, 0);
        push[0] = RESULT[0];
        push[1] = RESULT[1];
        push[2] = RESULT[2];
        if (startMoves) {
          accumulator.maximum(startParticle, friction);
          accumulator.addSecondaryVector(startParticle, push);
        }
        if (endMoves) {
          accumulator.maximum(endParticle, friction);
          accumulator.addSecondaryVector(endParticle, push);
        }
      }
    }

    // Each particle takes the average push of its edges, the largest friction and the summed normal direction, then
    // clears its accumulator entries.
    const contactCounts = accumulator.count;
    const pushSums = accumulator.sum;
    const frictionMaxima = accumulator.floatMaximum;
    const normalSums = accumulator.sumSecondary;
    for (let particle = 0; particle < simulation.particleCount; particle++) {
      const offset = particle * 3;
      if (contactCounts[particle] > 0) {
        const contactCount = Math.fround(contactCounts[particle]);
        nextPositions[offset] = fround(nextPositions[offset] + Math.fround(Math.fround(Math.fround(pushSums[offset]) / contactCount) * FIXED_POINT_SCALE));
        nextPositions[offset + 1] = fround(
          nextPositions[offset + 1] + Math.fround(Math.fround(Math.fround(pushSums[offset + 1]) / contactCount) * FIXED_POINT_SCALE),
        );
        nextPositions[offset + 2] = fround(
          nextPositions[offset + 2] + Math.fround(Math.fround(Math.fround(pushSums[offset + 2]) / contactCount) * FIXED_POINT_SCALE),
        );
      }

      const largestFriction = Math.fround(Math.fround(frictionMaxima[particle]) * FIXED_POINT_SCALE);
      if (largestFriction > 0 && largestFriction > simulation.frictions[particle]) simulation.frictions[particle] = largestFriction;

      const normalSumX = Math.fround(Math.fround(normalSums[offset]) * FIXED_POINT_SCALE);
      const normalSumY = Math.fround(Math.fround(normalSums[offset + 1]) * FIXED_POINT_SCALE);
      const normalSumZ = Math.fround(Math.fround(normalSums[offset + 2]) * FIXED_POINT_SCALE);
      if (dot(normalSumX, normalSumY, normalSumZ, normalSumX, normalSumY, normalSumZ) > 0) {
        INPUT[0] = normalSumX;
        INPUT[1] = normalSumY;
        INPUT[2] = normalSumZ;
        normalizeAt(INPUT, 0);
        setVector(simulation.collisionNormals, offset, RESULT[0], RESULT[1], RESULT[2]);
      }

      contactCounts[particle] = 0;
      pushSums[offset] = 0;
      pushSums[offset + 1] = 0;
      pushSums[offset + 2] = 0;
      frictionMaxima[particle] = 0;
      normalSums[offset] = 0;
      normalSums[offset + 1] = 0;
      normalSums[offset + 2] = 0;
    }
  }

  // The edge's contact with one collider. The normal comes from the collider's old pose and the distance from its next
  // pose, so a collider moving toward the edge pushes it.
  detectContact(colliderWork: ColliderWork, isSphere: boolean): void {
    this.normalX = 0;
    this.normalY = 0;
    this.normalZ = 0;
    if (!boundsOverlap(this.boxMinimum, this.boxMaximum, colliderWork)) {
      this.distance = LARGEST_DISTANCE;
      return;
    }
    if (isSphere) this.detectSphereContact(colliderWork);
    else this.detectCapsuleContact(colliderWork);
  }

  // A sphere uses only the start values of the collider: its center and radius.
  detectSphereContact(colliderWork: ColliderWork): void {
    const oldCenter = colliderWork.oldPositions[0];
    const nextCenter = colliderWork.nextPositions[0];
    const edgeStartX = this.edgeStartX;
    const edgeStartY = this.edgeStartY;
    const edgeStartZ = this.edgeStartZ;
    const edgeEndX = this.edgeEndX;
    const edgeEndY = this.edgeEndY;
    const edgeEndZ = this.edgeEndZ;
    const edgeRatio = closestRatioOnSegment(oldCenter[0], oldCenter[1], oldCenter[2], edgeStartX, edgeStartY, edgeStartZ, edgeEndX, edgeEndY, edgeEndZ);
    const edgePointX = interpolate(edgeStartX, edgeEndX, edgeRatio);
    const edgePointY = interpolate(edgeStartY, edgeEndY, edgeRatio);
    const edgePointZ = interpolate(edgeStartZ, edgeEndZ, edgeRatio);
    const centerToEdgeX = fround(edgePointX - oldCenter[0]);
    const centerToEdgeY = fround(edgePointY - oldCenter[1]);
    const centerToEdgeZ = fround(edgePointZ - oldCenter[2]);
    const centerDistance = sqrt(dot(centerToEdgeX, centerToEdgeY, centerToEdgeZ, centerToEdgeX, centerToEdgeY, centerToEdgeZ));
    // The edge passes through the center, which leaves no direction to push it.
    if (centerDistance < fround(1e-9)) {
      this.distance = LARGEST_DISTANCE;
      return;
    }

    const normalX = fround(centerToEdgeX / centerDistance);
    const normalY = fround(centerToEdgeY / centerDistance);
    const normalZ = fround(centerToEdgeZ / centerDistance);
    this.normalX = normalX;
    this.normalY = normalY;
    this.normalZ = normalZ;
    const centerMovement = dot(
      normalX,
      normalY,
      normalZ,
      fround(nextCenter[0] - oldCenter[0]),
      fround(nextCenter[1] - oldCenter[1]),
      fround(nextCenter[2] - oldCenter[2]),
    );
    const thickness = fround(interpolate(this.edgeStartRadius, this.edgeEndRadius, edgeRatio) + colliderWork.radius[0]);
    // Still out of contact and friction range after the center moves toward the edge.
    if (fround(centerDistance - centerMovement) > fround(thickness + this.frictionRange)) {
      this.distance = LARGEST_DISTANCE;
      return;
    }

    this.edgeRatio = edgeRatio;
    this.distanceAlongNormal = dot(
      normalX,
      normalY,
      normalZ,
      fround(edgePointX - nextCenter[0]),
      fround(edgePointY - nextCenter[1]),
      fround(edgePointZ - nextCenter[2]),
    );
    this.thickness = thickness;
    this.resolveContact();
  }

  detectCapsuleContact(colliderWork: ColliderWork): void {
    const oldStart = colliderWork.oldPositions[0];
    const oldEnd = colliderWork.oldPositions[1];
    const nextStart = colliderWork.nextPositions[0];
    const nextEnd = colliderWork.nextPositions[1];
    const startRadius = colliderWork.radius[0];
    const endRadius = colliderWork.radius[1];

    this.segmentStartX = oldStart[0];
    this.segmentStartY = oldStart[1];
    this.segmentStartZ = oldStart[2];
    this.segmentEndX = oldEnd[0];
    this.segmentEndY = oldEnd[1];
    this.segmentEndZ = oldEnd[2];
    this.closestPointsToSegment();
    let edgeRatio = this.edgeRatio;
    let axisRatio = this.segmentRatio;
    let edgePointX = this.edgePointX;
    let edgePointY = this.edgePointY;
    let edgePointZ = this.edgePointZ;
    let axisDistance = sqrt(this.squaredDistance);
    // The edge crosses the capsule axis, which leaves no direction to push it.
    if (axisDistance < fround(1e-9)) {
      this.distance = LARGEST_DISTANCE;
      return;
    }

    let normalX = fround(fround(edgePointX - this.segmentPointX) / axisDistance);
    let normalY = fround(fround(edgePointY - this.segmentPointY) / axisDistance);
    let normalZ = fround(fround(edgePointZ - this.segmentPointZ) / axisDistance);

    // On a tapered capsule the closest surface point differs from the closest axis point: search again against the axis
    // shifted by each end's radius along the normal, then take the normal from the axis point at the new ratio.
    if (startRadius !== endRadius) {
      this.segmentStartX = fround(oldStart[0] + fround(normalX * startRadius));
      this.segmentStartY = fround(oldStart[1] + fround(normalY * startRadius));
      this.segmentStartZ = fround(oldStart[2] + fround(normalZ * startRadius));
      this.segmentEndX = fround(oldEnd[0] + fround(normalX * endRadius));
      this.segmentEndY = fround(oldEnd[1] + fround(normalY * endRadius));
      this.segmentEndZ = fround(oldEnd[2] + fround(normalZ * endRadius));
      this.closestPointsToSegment();
      edgeRatio = this.edgeRatio;
      axisRatio = this.segmentRatio;
      edgePointX = interpolate(this.edgeStartX, this.edgeEndX, edgeRatio);
      edgePointY = interpolate(this.edgeStartY, this.edgeEndY, edgeRatio);
      edgePointZ = interpolate(this.edgeStartZ, this.edgeEndZ, edgeRatio);
      const axisToEdgeX = fround(edgePointX - interpolate(oldStart[0], oldEnd[0], axisRatio));
      const axisToEdgeY = fround(edgePointY - interpolate(oldStart[1], oldEnd[1], axisRatio));
      const axisToEdgeZ = fround(edgePointZ - interpolate(oldStart[2], oldEnd[2], axisRatio));
      axisDistance = sqrt(dot(axisToEdgeX, axisToEdgeY, axisToEdgeZ, axisToEdgeX, axisToEdgeY, axisToEdgeZ));
      normalX = fround(axisToEdgeX / axisDistance);
      normalY = fround(axisToEdgeY / axisDistance);
      normalZ = fround(axisToEdgeZ / axisDistance);
    }

    this.normalX = normalX;
    this.normalY = normalY;
    this.normalZ = normalZ;
    const axisDisplacementX = interpolate(fround(nextStart[0] - oldStart[0]), fround(nextEnd[0] - oldEnd[0]), axisRatio);
    const axisDisplacementY = interpolate(fround(nextStart[1] - oldStart[1]), fround(nextEnd[1] - oldEnd[1]), axisRatio);
    const axisDisplacementZ = interpolate(fround(nextStart[2] - oldStart[2]), fround(nextEnd[2] - oldEnd[2]), axisRatio);
    const axisMovement = dot(normalX, normalY, normalZ, axisDisplacementX, axisDisplacementY, axisDisplacementZ);
    const thickness = fround(interpolate(this.edgeStartRadius, this.edgeEndRadius, edgeRatio) + interpolate(startRadius, endRadius, axisRatio));
    // Still out of contact and friction range after the axis point moves toward the edge.
    if (fround(axisDistance - axisMovement) > fround(thickness + this.frictionRange)) {
      this.distance = LARGEST_DISTANCE;
      return;
    }

    const axisPointX = interpolate(nextStart[0], nextEnd[0], axisRatio);
    const axisPointY = interpolate(nextStart[1], nextEnd[1], axisRatio);
    const axisPointZ = interpolate(nextStart[2], nextEnd[2], axisRatio);
    this.edgeRatio = edgeRatio;
    this.distanceAlongNormal = dot(
      normalX,
      normalY,
      normalZ,
      fround(edgePointX - axisPointX),
      fround(edgePointY - axisPointY),
      fround(edgePointZ - axisPointZ),
    );
    this.thickness = thickness;
    this.resolveContact();
  }

  // Closer than thickness along the normal, both edge ends are pushed out along it, weighted by how close each is to
  // the edge point at edgeRatio.
  resolveContact(): void {
    const distanceAlongNormal = this.distanceAlongNormal;
    const thickness = this.thickness;
    const edgeStartX = this.edgeStartX;
    const edgeStartY = this.edgeStartY;
    const edgeStartZ = this.edgeStartZ;
    const edgeEndX = this.edgeEndX;
    const edgeEndY = this.edgeEndY;
    const edgeEndZ = this.edgeEndZ;
    this.pushedStartX = edgeStartX;
    this.pushedStartY = edgeStartY;
    this.pushedStartZ = edgeStartZ;
    this.pushedEndX = edgeEndX;
    this.pushedEndY = edgeEndY;
    this.pushedEndZ = edgeEndZ;
    if (distanceAlongNormal > thickness) {
      this.distance = fround(distanceAlongNormal - thickness);
      return;
    }

    const penetration = fround(thickness - distanceAlongNormal);
    const startWeight = fround(1 - this.edgeRatio);
    const endWeight = this.edgeRatio;
    // Each end moves by its weight times penetration / (startWeight² + endWeight²), which moves the edge point at
    // edgeRatio out by exactly the penetration. The scale holds the squared weight sum first.
    let correctionScale = fround(fround(startWeight * startWeight) + fround(endWeight * endWeight));
    if (correctionScale === 0) {
      this.distance = LARGEST_DISTANCE;
      return;
    }
    correctionScale = fround(penetration / correctionScale);
    const normalX = this.normalX;
    const normalY = this.normalY;
    const normalZ = this.normalZ;
    this.distance = -penetration;
    this.pushedStartX = fround(edgeStartX + fround(fround(normalX * startWeight) * correctionScale));
    this.pushedStartY = fround(edgeStartY + fround(fround(normalY * startWeight) * correctionScale));
    this.pushedStartZ = fround(edgeStartZ + fround(fround(normalZ * startWeight) * correctionScale));
    this.pushedEndX = fround(edgeEndX + fround(fround(normalX * endWeight) * correctionScale));
    this.pushedEndY = fround(edgeEndY + fround(fround(normalY * endWeight) * correctionScale));
    this.pushedEndZ = fround(edgeEndZ + fround(fround(normalZ * endWeight) * correctionScale));
  }

  // The closest points between the edge and the segment, following Ericson's Real-Time Collision Detection.
  closestPointsToSegment(): void {
    const firstStartX = this.edgeStartX;
    const firstStartY = this.edgeStartY;
    const firstStartZ = this.edgeStartZ;
    const secondStartX = this.segmentStartX;
    const secondStartY = this.segmentStartY;
    const secondStartZ = this.segmentStartZ;
    const firstDirectionX = fround(this.edgeEndX - firstStartX);
    const firstDirectionY = fround(this.edgeEndY - firstStartY);
    const firstDirectionZ = fround(this.edgeEndZ - firstStartZ);
    const secondDirectionX = fround(this.segmentEndX - secondStartX);
    const secondDirectionY = fround(this.segmentEndY - secondStartY);
    const secondDirectionZ = fround(this.segmentEndZ - secondStartZ);
    const startOffsetX = fround(firstStartX - secondStartX);
    const startOffsetY = fround(firstStartY - secondStartY);
    const startOffsetZ = fround(firstStartZ - secondStartZ);
    const firstLengthSquared = dot(firstDirectionX, firstDirectionY, firstDirectionZ, firstDirectionX, firstDirectionY, firstDirectionZ);
    const secondLengthSquared = dot(secondDirectionX, secondDirectionY, secondDirectionZ, secondDirectionX, secondDirectionY, secondDirectionZ);
    const secondDotOffset = dot(secondDirectionX, secondDirectionY, secondDirectionZ, startOffsetX, startOffsetY, startOffsetZ);
    // A segment whose squared length is within this tolerance counts as a single point.
    const tolerance = fround(1e-8);

    let firstRatio;
    let secondRatio;
    if (firstLengthSquared <= tolerance && secondLengthSquared <= tolerance) {
      firstRatio = 0;
      secondRatio = 0;
    } else if (firstLengthSquared <= tolerance) {
      firstRatio = 0;
      secondRatio = saturate(fround(secondDotOffset / secondLengthSquared));
    } else {
      const firstDotOffset = dot(firstDirectionX, firstDirectionY, firstDirectionZ, startOffsetX, startOffsetY, startOffsetZ);
      if (secondLengthSquared <= tolerance) {
        secondRatio = 0;
        firstRatio = saturate(fround(-firstDotOffset / firstLengthSquared));
      } else {
        const directionsDot = dot(firstDirectionX, firstDirectionY, firstDirectionZ, secondDirectionX, secondDirectionY, secondDirectionZ);
        // Zero for parallel segments, where every first ratio is equally close, so 0 is taken.
        const denominator = fround(fround(firstLengthSquared * secondLengthSquared) - fround(directionsDot * directionsDot));
        firstRatio =
          denominator !== 0
            ? saturate(fround(fround(fround(directionsDot * secondDotOffset) - fround(firstDotOffset * secondLengthSquared)) / denominator))
            : 0;
        secondRatio = fround(fround(fround(directionsDot * firstRatio) + secondDotOffset) / secondLengthSquared);

        // The second ratio fell outside its segment: clamp it and find the first ratio again for that end.
        if (secondRatio < 0) {
          secondRatio = 0;
          firstRatio = saturate(fround(-firstDotOffset / firstLengthSquared));
        } else if (secondRatio > 1) {
          secondRatio = 1;
          firstRatio = saturate(fround(fround(directionsDot - firstDotOffset) / firstLengthSquared));
        }
      }
    }

    const firstClosestX = fround(firstStartX + fround(firstDirectionX * firstRatio));
    const firstClosestY = fround(firstStartY + fround(firstDirectionY * firstRatio));
    const firstClosestZ = fround(firstStartZ + fround(firstDirectionZ * firstRatio));
    const secondClosestX = fround(secondStartX + fround(secondDirectionX * secondRatio));
    const secondClosestY = fround(secondStartY + fround(secondDirectionY * secondRatio));
    const secondClosestZ = fround(secondStartZ + fround(secondDirectionZ * secondRatio));
    const separationX = fround(firstClosestX - secondClosestX);
    const separationY = fround(firstClosestY - secondClosestY);
    const separationZ = fround(firstClosestZ - secondClosestZ);
    this.edgeRatio = firstRatio;
    this.segmentRatio = secondRatio;
    this.edgePointX = firstClosestX;
    this.edgePointY = firstClosestY;
    this.edgePointZ = firstClosestZ;
    this.segmentPointX = secondClosestX;
    this.segmentPointY = secondClosestY;
    this.segmentPointZ = secondClosestZ;
    this.squaredDistance = dot(separationX, separationY, separationZ, separationX, separationY, separationZ);
  }
}

const EDGE_COLLISION = new EdgeCollision();

export function solveEdgeCollision(simulation: SimulatedCloth): void {
  EDGE_COLLISION.solve(simulation);
}

// Point collision: every moving particle against the cloth's colliders. The methods share the particle, the plane and
// the contact through fields instead of passing numbers to each other: V8 boxes every number that crosses a call it
// did not inline, and these calls run for every particle and collider in every step.
class PointCollision {
  // The particle: its position and radius, and its bounding box grown by the radius and the friction range.
  pointX = 0;
  pointY = 0;
  pointZ = 0;
  particleRadius = 0;
  readonly boxMinimum = [0, 0, 0];
  readonly boxMaximum = [0, 0, 0];

  // A point on the contact plane, which intersectPlane tests the particle against.
  planePointX = 0;
  planePointY = 0;
  planePointZ = 0;

  // The contact with one collider: the particle's distance from the contact plane (negative behind it), the particle
  // moved onto the plane when it is behind, and the plane's normal. The normal comes from the collider's old pose and
  // the plane from its next pose, so a collider moving toward the particle pushes it.
  distance = 0;
  contactX = 0;
  contactY = 0;
  contactZ = 0;
  normalX = 0;
  normalY = 0;
  normalZ = 0;

  solve(simulation: SimulatedCloth): void {
    const mesh = simulation.mesh;
    const attributes = mesh.attributes;
    const parameters = simulation.parameters;
    const nextPositions = simulation.nextPositions;
    const boxMinimum = this.boxMinimum;
    const boxMaximum = this.boxMaximum;
    const activeColliders = nearColliders(simulation);
    const activeColliderCount = activeColliders.length;
    const particleRadii = depthCurve(simulation, CURVE_RADIUS, parameters.radiusCurve, false);

    for (let particle = 0; particle < simulation.particleCount; particle++) {
      const attribute = attributes[particle];
      if (isExcluded(attribute) || attribute & Attribute.SkipCollision || !isSimulated(attribute)) continue;

      const offset = particle * 3;
      let positionX = nextPositions[offset];
      let positionY = nextPositions[offset + 1];
      let positionZ = nextPositions[offset + 2];
      const curveRadius = particleRadii[particle];
      const smallestRadius = fround(0.0001);
      const particleRadius = fround((curveRadius > smallestRadius ? curveRadius : smallestRadius) * simulation.timing.worldScaleRatio);
      // Colliders whose gap to the surface is at most this still add friction.
      const frictionRange = particleRadius;
      this.pointX = positionX;
      this.pointY = positionY;
      this.pointZ = positionZ;
      this.particleRadius = particleRadius;

      for (let axis = 0; axis < 3; axis++) {
        boxMinimum[axis] = fround(fround(nextPositions[offset + axis] - particleRadius) - frictionRange);
        boxMaximum[axis] = fround(fround(nextPositions[offset + axis] + particleRadius) + frictionRange);
      }

      let closestDistance = LARGEST_DISTANCE;
      let hasFrictionContact = false;
      let collisionNormalX = 0;
      let collisionNormalY = 0;
      let collisionNormalZ = 0;
      let pushX = 0;
      let pushY = 0;
      let pushZ = 0;
      let pushCount = 0;
      let pushNormalX = 0;
      let pushNormalY = 0;
      let pushNormalZ = 0;
      for (let colliderIndex = 0; colliderIndex < activeColliderCount; colliderIndex++) {
        const collider = activeColliders[colliderIndex];
        const colliderWork = collider.work;
        if (!colliderWork) continue;
        this.detectContact(colliderWork, collider.type === 1);
        const distance = this.distance;
        if (distance <= 0) {
          pushX = fround(pushX + fround(this.contactX - positionX));
          pushY = fround(pushY + fround(this.contactY - positionY));
          pushZ = fround(pushZ + fround(this.contactZ - positionZ));
          pushNormalX = fround(pushNormalX + this.normalX);
          pushNormalY = fround(pushNormalY + this.normalY);
          pushNormalZ = fround(pushNormalZ + this.normalZ);
          pushCount++;
        }
        if (distance <= frictionRange) {
          hasFrictionContact = true;
          collisionNormalX = fround(collisionNormalX + this.normalX);
          collisionNormalY = fround(collisionNormalY + this.normalY);
          collisionNormalZ = fround(collisionNormalZ + this.normalZ);
          closestDistance = closestDistance < distance ? closestDistance : distance;
        }
      }

      // Scaling the average push by the average normal's length weakens it when colliders push from different sides.
      if (pushCount > 0) {
        pushNormalX = fround(pushNormalX / pushCount);
        pushNormalY = fround(pushNormalY / pushCount);
        pushNormalZ = fround(pushNormalZ / pushCount);
        const pushNormalLength = sqrt(dot(pushNormalX, pushNormalY, pushNormalZ, pushNormalX, pushNormalY, pushNormalZ));
        if (pushNormalLength >= EPSILON) {
          const pushScale = pushNormalLength < 1 ? pushNormalLength : 1;
          positionX = fround(positionX + fround(fround(pushX / pushCount) * pushScale));
          positionY = fround(positionY + fround(fround(pushY / pushCount) * pushScale));
          positionZ = fround(positionZ + fround(fround(pushZ / pushCount) * pushScale));
          simulation.stats.contacts++;
        }
      }

      if (
        hasFrictionContact &&
        frictionRange > 0 &&
        dot(collisionNormalX, collisionNormalY, collisionNormalZ, collisionNormalX, collisionNormalY, collisionNormalZ) > fround(1e-6)
      ) {
        // Full friction at contact, fading to none at the end of the friction range.
        const friction = fround(1 - saturate(fround(closestDistance / frictionRange)));
        simulation.frictions[particle] = friction > simulation.frictions[particle] ? friction : simulation.frictions[particle];
        INPUT[0] = collisionNormalX;
        INPUT[1] = collisionNormalY;
        INPUT[2] = collisionNormalZ;
        normalizeAt(INPUT, 0);
        collisionNormalX = RESULT[0];
        collisionNormalY = RESULT[1];
        collisionNormalZ = RESULT[2];
      }

      setVector(simulation.collisionNormals, offset, collisionNormalX, collisionNormalY, collisionNormalZ);
      nextPositions[offset] = positionX;
      nextPositions[offset + 1] = positionY;
      nextPositions[offset + 2] = positionZ;
    }
  }

  // The particle's contact with one collider.
  detectContact(colliderWork: ColliderWork, isSphere: boolean): void {
    this.normalX = 0;
    this.normalY = 0;
    this.normalZ = 0;
    if (!boundsOverlap(this.boxMinimum, this.boxMaximum, colliderWork)) {
      this.distance = LARGEST_DISTANCE;
      this.contactX = this.pointX;
      this.contactY = this.pointY;
      this.contactZ = this.pointZ;
      return;
    }
    if (isSphere) this.detectSphereContact(colliderWork);
    else this.detectCapsuleContact(colliderWork);
  }

  detectSphereContact(colliderWork: ColliderWork): void {
    const oldCenter = colliderWork.oldPositions[0];
    const nextCenter = colliderWork.nextPositions[0];
    INPUT[0] = fround(this.pointX - oldCenter[0]);
    INPUT[1] = fround(this.pointY - oldCenter[1]);
    INPUT[2] = fround(this.pointZ - oldCenter[2]);
    normalizeAt(INPUT, 0);
    const sphereNormalX = RESULT[0];
    const sphereNormalY = RESULT[1];
    const sphereNormalZ = RESULT[2];
    const sphereContactRadius = fround(colliderWork.radius[0] + this.particleRadius);
    this.planePointX = fround(nextCenter[0] + fround(sphereNormalX * sphereContactRadius));
    this.planePointY = fround(nextCenter[1] + fround(sphereNormalY * sphereContactRadius));
    this.planePointZ = fround(nextCenter[2] + fround(sphereNormalZ * sphereContactRadius));
    this.normalX = sphereNormalX;
    this.normalY = sphereNormalY;
    this.normalZ = sphereNormalZ;
    this.intersectPlane();
  }

  detectCapsuleContact(colliderWork: ColliderWork): void {
    const colliderOldStart = colliderWork.oldPositions[0];
    const colliderOldEnd = colliderWork.oldPositions[1];
    const colliderNextStart = colliderWork.nextPositions[0];
    const colliderNextEnd = colliderWork.nextPositions[1];
    const pointX = this.pointX;
    const pointY = this.pointY;
    const pointZ = this.pointZ;
    const axisRatio = closestRatioOnSegment(
      pointX,
      pointY,
      pointZ,
      colliderOldStart[0],
      colliderOldStart[1],
      colliderOldStart[2],
      colliderOldEnd[0],
      colliderOldEnd[1],
      colliderOldEnd[2],
    );
    const axisRadius = interpolate(colliderWork.radius[0], colliderWork.radius[1], axisRatio);
    const inverseOldRotation = colliderWork.inverseOldRotation;
    const rotation = colliderWork.rotation;

    // Turns the offset from the old axis point by the collider's rotation since the last step, so the normal follows
    // the capsule as it turns.
    INPUT[0] = inverseOldRotation[0];
    INPUT[1] = inverseOldRotation[1];
    INPUT[2] = inverseOldRotation[2];
    INPUT[3] = inverseOldRotation[3];
    INPUT[4] = rotation[0];
    INPUT[5] = rotation[1];
    INPUT[6] = rotation[2];
    INPUT[7] = rotation[3];
    INPUT[8] = fround(pointX - interpolate(colliderOldStart[0], colliderOldEnd[0], axisRatio));
    INPUT[9] = fround(pointY - interpolate(colliderOldStart[1], colliderOldEnd[1], axisRatio));
    INPUT[10] = fround(pointZ - interpolate(colliderOldStart[2], colliderOldEnd[2], axisRatio));
    rotateVectorAt(INPUT, 0, INPUT, 8);
    rotateVectorAt(INPUT, 4, RESULT, 0);
    normalizeAt(RESULT, 0);
    const capsuleNormalX = RESULT[0];
    const capsuleNormalY = RESULT[1];
    const capsuleNormalZ = RESULT[2];
    const capsuleContactRadius = fround(axisRadius + this.particleRadius);
    this.planePointX = fround(interpolate(colliderNextStart[0], colliderNextEnd[0], axisRatio) + fround(capsuleNormalX * capsuleContactRadius));
    this.planePointY = fround(interpolate(colliderNextStart[1], colliderNextEnd[1], axisRatio) + fround(capsuleNormalY * capsuleContactRadius));
    this.planePointZ = fround(interpolate(colliderNextStart[2], colliderNextEnd[2], axisRatio) + fround(capsuleNormalZ * capsuleContactRadius));
    this.normalX = capsuleNormalX;
    this.normalY = capsuleNormalY;
    this.normalZ = capsuleNormalZ;
    this.intersectPlane();
  }

  // The particle's distance from the plane through planePoint along the normal, and the particle moved onto the plane
  // when it is behind it.
  intersectPlane(): void {
    const pointX = this.pointX;
    const pointY = this.pointY;
    const pointZ = this.pointZ;
    const normalX = this.normalX;
    const normalY = this.normalY;
    const normalZ = this.normalZ;
    const planeToPointX = fround(pointX - this.planePointX);
    const planeToPointY = fround(pointY - this.planePointY);
    const planeToPointZ = fround(pointZ - this.planePointZ);
    const signedDistance = dot(planeToPointX, planeToPointY, planeToPointZ, normalX, normalY, normalZ);
    const normalOffsetX = fround(normalX * signedDistance);
    const normalOffsetY = fround(normalY * signedDistance);
    const normalOffsetZ = fround(normalZ * signedDistance);
    const distance = sqrt(dot(normalOffsetX, normalOffsetY, normalOffsetZ, normalOffsetX, normalOffsetY, normalOffsetZ));
    if (dot(normalX, normalY, normalZ, planeToPointX, planeToPointY, planeToPointZ) < 0) {
      this.distance = -distance;
      this.contactX = fround(pointX - normalOffsetX);
      this.contactY = fround(pointY - normalOffsetY);
      this.contactZ = fround(pointZ - normalOffsetZ);
    } else {
      this.distance = distance;
      this.contactX = pointX;
      this.contactY = pointY;
      this.contactZ = pointZ;
    }
  }
}

const POINT_COLLISION = new PointCollision();

export function solvePointCollision(simulation: SimulatedCloth): void {
  POINT_COLLISION.solve(simulation);
}

// Writes the spherical interpolation by amounts[amountOffset] from the quaternion at from[fromOffset..] to the one at
// to[toOffset..] into RESULT[4..7], falling back to normalized linear interpolation.
function sphericalInterpolationAt(
  from: Float64Array,
  fromOffset: number,
  to: Float64Array,
  toOffset: number,
  amounts: Float64Array,
  amountOffset: number,
): void {
  const fromX = from[fromOffset];
  const fromY = from[fromOffset + 1];
  const fromZ = from[fromOffset + 2];
  const fromW = from[fromOffset + 3];
  let toX = to[toOffset];
  let toY = to[toOffset + 1];
  let toZ = to[toOffset + 2];
  let toW = to[toOffset + 3];
  const amount = amounts[amountOffset];
  let cosine = fround(fround(fround(fround(fromX * toX) + fround(fromY * toY)) + fround(fromZ * toZ)) + fround(fromW * toW));

  // A quaternion and its negation are the same rotation; negating the target takes the shorter arc.
  if (cosine < 0) {
    cosine = -cosine;
    toX = -toX;
    toY = -toY;
    toZ = -toZ;
    toW = -toW;
  }

  // Nearly equal rotations make the sine of the angle vanish, so they take the linear fallback below.
  if (cosine < fround(0.9995)) {
    const angle = fround(Math.acos(cosine));
    // Math.sqrt written out: this branch runs too rarely for V8 to inline a helper, and the call would box.
    const inverseSine = fround(1 / fround(Math.sqrt(fround(1 - fround(cosine * cosine)))));
    const fromWeight = fround(fround(Math.sin(fround(angle * fround(1 - amount)))) * inverseSine);
    const toWeight = fround(fround(Math.sin(fround(angle * amount))) * inverseSine);
    RESULT[4] = fround(fround(fromX * fromWeight) + fround(toX * toWeight));
    RESULT[5] = fround(fround(fromY * fromWeight) + fround(toY * toWeight));
    RESULT[6] = fround(fround(fromZ * fromWeight) + fround(toZ * toWeight));
    RESULT[7] = fround(fround(fromW * fromWeight) + fround(toW * toWeight));
    return;
  }

  // A redundant guard: after the negation above this product is never negative.
  if (fround(fround(fround(fround(fromX * toX) + fround(fromY * toY)) + fround(fromZ * toZ)) + fround(fromW * toW)) < 0) {
    toX = -toX;
    toY = -toY;
    toZ = -toZ;
    toW = -toW;
  }
  RESULT[4] = interpolate(fromX, toX, amount);
  RESULT[5] = interpolate(fromY, toY, amount);
  RESULT[6] = interpolate(fromZ, toZ, amount);
  RESULT[7] = interpolate(fromW, toW, amount);
  normalizeQuaternionAt(RESULT, 4);
}

// Carries every stored particle state along with this frame's anchor movement: positions turn around the old anchor
// position and then shift, while rotations and velocities only turn.
export function shiftForAnchor(simulation: SimulatedCloth): void {
  const center = simulation.center;
  const oldAnchorPosition = center.oldAnchorWorldPosition;
  const anchorShift = center.frameAnchorShift;
  const anchorRotation = center.frameAnchorShiftRotation;
  // The rotation stays in INPUT[0..3], where the helpers read it.
  INPUT[0] = anchorRotation[0];
  INPUT[1] = anchorRotation[1];
  INPUT[2] = anchorRotation[2];
  INPUT[3] = anchorRotation[3];

  const shiftPosition = (buffer: Float64Array, offset: number): void => {
    INPUT[4] = fround(buffer[offset] - oldAnchorPosition[0]);
    INPUT[5] = fround(buffer[offset + 1] - oldAnchorPosition[1]);
    INPUT[6] = fround(buffer[offset + 2] - oldAnchorPosition[2]);
    rotateVectorAt(INPUT, 0, INPUT, 4);
    setVector(
      buffer,
      offset,
      fround(oldAnchorPosition[0] + fround(RESULT[0] + anchorShift[0])),
      fround(oldAnchorPosition[1] + fround(RESULT[1] + anchorShift[1])),
      fround(oldAnchorPosition[2] + fround(RESULT[2] + anchorShift[2])),
    );
  };
  const turnRotation = (buffer: Float64Array, offset: number): void => {
    multiplyQuaternionsAt(INPUT, 0, buffer, offset);
    setQuaternion(buffer, offset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
  };
  const turnDirection = (buffer: Float64Array, offset: number): void => {
    rotateVectorAt(INPUT, 0, buffer, offset);
    setVector(buffer, offset, RESULT[0], RESULT[1], RESULT[2]);
  };

  for (let particle = 0, positionOffset = 0, rotationOffset = 0; particle < simulation.particleCount; particle++, positionOffset += 3, rotationOffset += 4) {
    shiftPosition(simulation.oldPositions, positionOffset);
    turnRotation(simulation.oldRotations, rotationOffset);
    shiftPosition(simulation.inputOldPositions, positionOffset);
    turnRotation(simulation.inputOldRotations, rotationOffset);
    shiftPosition(simulation.displayPositions, positionOffset);
    turnDirection(simulation.velocities, positionOffset);
    turnDirection(simulation.displacementVelocities, positionOffset);
  }
}

export function integrateParticles(simulation: SimulatedCloth, simulationDeltaTime: number, frequencyScale: FrequencyScale): void {
  const timing = simulation.timing;
  const center = simulation.center;
  const parameters = simulation.parameters;
  const attributes = simulation.mesh.attributes;
  const depths = simulation.mesh.depths;
  const stepFraction = timing.stepFraction;

  const inertiaShift = center.stepInertiaShift;
  const centerShift = center.stepCenterShift;
  const inertiaRotation = center.stepInertiaRotation;
  const centerShiftRotation = center.stepCenterShiftRotation;
  const oldCenterPosition = center.oldStepCenterPosition;

  const gravityDirection = parameters.worldGravityDirection;
  const gravityStrength = fround(parameters.gravity * timing.gravityFalloffRatio);
  const dampings = depthCurve(simulation, CURVE_DAMPING, parameters.dampingCurve, true);
  const nextPositions = simulation.nextPositions;
  const velocityOrigins = simulation.velocityOrigins;
  const oldPositions = simulation.oldPositions;
  const inputOldPositions = simulation.inputOldPositions;
  const inputOldRotations = simulation.inputOldRotations;
  const positions = simulation.positions;
  const rotations = simulation.rotations;
  const velocities = simulation.velocities;

  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const positionOffset = particle * 3;
    const rotationOffset = particle * 4;
    const depth = depths[particle];

    // The base pose: the input pose of the previous frame moved toward the current one by this step's fraction.
    const baseX = interpolate(inputOldPositions[positionOffset], positions[positionOffset], stepFraction);
    const baseY = interpolate(inputOldPositions[positionOffset + 1], positions[positionOffset + 1], stepFraction);
    const baseZ = interpolate(inputOldPositions[positionOffset + 2], positions[positionOffset + 2], stepFraction);
    INPUT[0] = stepFraction;
    sphericalInterpolationAt(inputOldRotations, rotationOffset, rotations, rotationOffset, INPUT, 0);
    normalizeQuaternionAt(RESULT, 4);
    setVector(simulation.basePositions, positionOffset, baseX, baseY, baseZ);
    setQuaternion(simulation.baseRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
    setVector(simulation.stepPosePositions, positionOffset, baseX, baseY, baseZ);
    setQuaternion(simulation.stepPoseRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);

    // Fixed particles stay on the base pose.
    if (!isSimulated(attributes[particle])) {
      nextPositions[positionOffset] = velocityOrigins[positionOffset] = baseX;
      nextPositions[positionOffset + 1] = velocityOrigins[positionOffset + 1] = baseY;
      nextPositions[positionOffset + 2] = velocityOrigins[positionOffset + 2] = baseZ;
      continue;
    }

    // Root follow: particles near the root (depth 0) take more of the full center shift, deeper ones more of the
    // inertia-reduced shift.
    const rootFollow = fround(parameters.inertia.rootFollowShare * fround(1 - fround(depth * depth)));
    const shiftX = interpolate(inertiaShift[0], centerShift[0], rootFollow);
    const shiftY = interpolate(inertiaShift[1], centerShift[1], rootFollow);
    const shiftZ = interpolate(inertiaShift[2], centerShift[2], rootFollow);
    INPUT[0] = inertiaRotation[0];
    INPUT[1] = inertiaRotation[1];
    INPUT[2] = inertiaRotation[2];
    INPUT[3] = inertiaRotation[3];
    INPUT[4] = centerShiftRotation[0];
    INPUT[5] = centerShiftRotation[1];
    INPUT[6] = centerShiftRotation[2];
    INPUT[7] = centerShiftRotation[3];
    INPUT[8] = rootFollow;
    sphericalInterpolationAt(INPUT, 0, INPUT, 4, INPUT, 8);

    // The old position carried with the center: turned around the old center position, then shifted. The shift
    // rotation stays in RESULT[4..7], which rotateVectorAt does not write.
    INPUT[0] = fround(oldPositions[positionOffset] - oldCenterPosition[0]);
    INPUT[1] = fround(oldPositions[positionOffset + 1] - oldCenterPosition[1]);
    INPUT[2] = fround(oldPositions[positionOffset + 2] - oldCenterPosition[2]);
    rotateVectorAt(RESULT, 4, INPUT, 0);
    const shiftedOldX = fround(oldCenterPosition[0] + fround(RESULT[0] + shiftX));
    const shiftedOldY = fround(oldCenterPosition[1] + fround(RESULT[1] + shiftY));
    const shiftedOldZ = fround(oldCenterPosition[2] + fround(RESULT[2] + shiftZ));
    const velocityOriginX = fround(oldPositions[positionOffset] + fround(shiftedOldX - oldPositions[positionOffset]));
    const velocityOriginY = fround(oldPositions[positionOffset + 1] + fround(shiftedOldY - oldPositions[positionOffset + 1]));
    const velocityOriginZ = fround(oldPositions[positionOffset + 2] + fround(shiftedOldZ - oldPositions[positionOffset + 2]));

    rotateVectorAt(RESULT, 4, velocities, positionOffset);
    let velocityX = fround(RESULT[0] * timing.settleWeight);
    let velocityY = fround(RESULT[1] * timing.settleWeight);
    let velocityZ = fround(RESULT[2] * timing.settleWeight);
    const damping = dampings[particle];
    const keptFraction = saturate(fround(1 - fround(damping * frequencyScale[2])));
    velocityX = fround(velocityX * keptFraction);
    velocityY = fround(velocityY * keptFraction);
    velocityZ = fround(velocityZ * keptFraction);

    let accelerationX = fround(gravityDirection[0] * gravityStrength);
    let accelerationY = fround(gravityDirection[1] * gravityStrength);
    let accelerationZ = fround(gravityDirection[2] * gravityStrength);

    // Force modes 1 and 2 push particles near the root less, as if they were heavier; 10 and 11 push every particle
    // the same. Modes 2 and 11 replace the velocity instead of adding to it.
    const forceMode = timing.forceMode;
    if (forceMode === 1 || forceMode === 2) {
      const rootCloseness = fround(1 - depth);
      const mass = fround(1 + fround(fround(rootCloseness * rootCloseness) * fround(5)));
      accelerationX = fround(accelerationX + fround(timing.pendingForce[0] / mass));
      accelerationY = fround(accelerationY + fround(timing.pendingForce[1] / mass));
      accelerationZ = fround(accelerationZ + fround(timing.pendingForce[2] / mass));
    } else if (forceMode === 10 || forceMode === 11) {
      accelerationX = fround(accelerationX + timing.pendingForce[0]);
      accelerationY = fround(accelerationY + timing.pendingForce[1]);
      accelerationZ = fround(accelerationZ + timing.pendingForce[2]);
    }
    if (forceMode === 2 || forceMode === 11) {
      velocityX = 0;
      velocityY = 0;
      velocityZ = 0;
    }

    accelerationX = fround(accelerationX * timing.worldScaleRatio);
    accelerationY = fround(accelerationY * timing.worldScaleRatio);
    accelerationZ = fround(accelerationZ * timing.worldScaleRatio);
    velocityX = fround(velocityX + fround(accelerationX * simulationDeltaTime));
    velocityY = fround(velocityY + fround(accelerationY * simulationDeltaTime));
    velocityZ = fround(velocityZ + fround(accelerationZ * simulationDeltaTime));

    // The integrated velocity is not stored; the post step recomputes it from the velocity origin.
    velocityOrigins[positionOffset] = velocityOriginX;
    velocityOrigins[positionOffset + 1] = velocityOriginY;
    velocityOrigins[positionOffset + 2] = velocityOriginZ;
    nextPositions[positionOffset] = fround(shiftedOldX + fround(velocityX * simulationDeltaTime));
    nextPositions[positionOffset + 1] = fround(shiftedOldY + fround(velocityY * simulationDeltaTime));
    nextPositions[positionOffset + 2] = fround(shiftedOldZ + fround(velocityZ * simulationDeltaTime));
  }
}

// Writes the column-major matrix times (x, y, z, w) into RESULT[0..2]; w is 1 for a point and 0 for a direction.
function transformByMatrix(matrix: readonly number[], x: number, y: number, z: number, w: number): void {
  for (let row = 0; row < 3; row++) {
    const linearPart = fround(fround(fround(matrix[row] * x) + fround(matrix[4 + row] * y)) + fround(matrix[8 + row] * z));
    RESULT[row] = w ? fround(linearPart + matrix[12 + row]) : linearPart;
  }
}

// Bind-pose position, normal and tangent of every vertex: mesh constants, so skin only applies the animated pose.
const boundFrames = new WeakMap<SimulatedCloth['mesh'], Float64Array>();

// Nine values per vertex: position, normal, tangent.
function boundFrame(mesh: SimulatedCloth['mesh']): Float64Array {
  let frames = boundFrames.get(mesh);
  if (frames) return frames;

  frames = new Float64Array(mesh.vertexCount * 9);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const bindPose = mesh.bindPoses[vertex];
    const localPosition = mesh.localPositions[vertex];
    const localNormal = mesh.localNormals[vertex];
    const localTangent = mesh.localTangents[vertex];
    const frameOffset = vertex * 9;
    transformByMatrix(bindPose, localPosition[0], localPosition[1], localPosition[2], 1);
    frames[frameOffset] = RESULT[0];
    frames[frameOffset + 1] = RESULT[1];
    frames[frameOffset + 2] = RESULT[2];
    transformByMatrix(bindPose, localNormal[0], localNormal[1], localNormal[2], 0);
    frames[frameOffset + 3] = RESULT[0];
    frames[frameOffset + 4] = RESULT[1];
    frames[frameOffset + 5] = RESULT[2];
    transformByMatrix(bindPose, localTangent[0], localTangent[1], localTangent[2], 0);
    frames[frameOffset + 6] = RESULT[0];
    frames[frameOffset + 7] = RESULT[1];
    frames[frameOffset + 8] = RESULT[2];
  }
  boundFrames.set(mesh, frames);
  return frames;
}

export function skin(simulation: SimulatedCloth, pose: PoseSource): void {
  const mesh = simulation.mesh;
  const frames = boundFrame(mesh);
  for (let vertex = 0; vertex < simulation.particleCount; vertex++) {
    const boneMatrix = pose(mesh.transformIds[vertex]).matrix;
    const frameOffset = vertex * 9;
    transformByMatrix(boneMatrix, frames[frameOffset], frames[frameOffset + 1], frames[frameOffset + 2], 1);
    setVector(simulation.positions, vertex * 3, RESULT[0], RESULT[1], RESULT[2]);

    transformByMatrix(boneMatrix, frames[frameOffset + 3], frames[frameOffset + 4], frames[frameOffset + 5], 0);
    normalizeAt(RESULT, 0);
    INPUT[0] = RESULT[0];
    INPUT[1] = RESULT[1];
    INPUT[2] = RESULT[2];

    // The rotation looks along the skinned tangent with the skinned normal as up.
    transformByMatrix(boneMatrix, frames[frameOffset + 6], frames[frameOffset + 7], frames[frameOffset + 8], 0);
    normalizeAt(RESULT, 0);
    lookRotationAt(RESULT, 0, INPUT, 0);
    setQuaternion(simulation.rotations, vertex * 4, LOOK_ROTATION[0], LOOK_ROTATION[1], LOOK_ROTATION[2], LOOK_ROTATION[3]);
  }
}

// One unit vector per triangle along axis, the value a triangle keeps until its own is defined.
function triangleBuffer(triangleCount: number, axis: number): Float64Array {
  const buffer = new Float64Array(triangleCount * 3);
  for (let offset = axis; offset < buffer.length; offset += 3) buffer[offset] = 1;
  return buffer;
}

export function writeTriangleFrames(simulation: SimulatedCloth): void {
  const mesh = simulation.mesh;
  const corrections = mesh.normalCorrectionRotations;
  const positions = simulation.positions;
  const triangles = mesh.triangles;
  const uvs = mesh.uvs;
  const normals = simulation.triangleNormals ?? (simulation.triangleNormals = triangleBuffer(triangles.length, 1));
  const tangents = simulation.triangleTangents ?? (simulation.triangleTangents = triangleBuffer(triangles.length, 2));

  // Normal and tangent of every triangle; degenerate triangles keep their previous values.
  for (let triangle = 0; triangle < triangles.length; triangle++) {
    const corners = triangles[triangle];
    const firstVertex = corners[0];
    const secondVertex = corners[1];
    const thirdVertex = corners[2];
    const firstOffset = firstVertex * 3;
    const secondOffset = secondVertex * 3;
    const thirdOffset = thirdVertex * 3;
    const firstEdgeX = fround(positions[secondOffset] - positions[firstOffset]);
    const firstEdgeY = fround(positions[secondOffset + 1] - positions[firstOffset + 1]);
    const firstEdgeZ = fround(positions[secondOffset + 2] - positions[firstOffset + 2]);
    const secondEdgeX = fround(positions[thirdOffset] - positions[firstOffset]);
    const secondEdgeY = fround(positions[thirdOffset + 1] - positions[firstOffset + 1]);
    const secondEdgeZ = fround(positions[thirdOffset + 2] - positions[firstOffset + 2]);

    cross(firstEdgeX, firstEdgeY, firstEdgeZ, secondEdgeX, secondEdgeY, secondEdgeZ);
    const crossLength = sqrt(dot(RESULT[0], RESULT[1], RESULT[2], RESULT[0], RESULT[1], RESULT[2]));
    if (crossLength > EPSILON)
      setVector(normals, triangle * 3, fround(RESULT[0] / crossLength), fround(RESULT[1] / crossLength), fround(RESULT[2] / crossLength));

    const firstUv = uvs[firstVertex];
    const secondUv = uvs[secondVertex];
    const thirdUv = uvs[thirdVertex];
    const firstUvEdgeX = fround(secondUv[0] - firstUv[0]);
    const firstUvEdgeY = fround(secondUv[1] - firstUv[1]);
    const secondUvEdgeX = fround(thirdUv[0] - firstUv[0]);
    const secondUvEdgeY = fround(thirdUv[1] - firstUv[1]);
    // Twice the signed UV area; a degenerate UV layout uses 1 so the division below stays finite.
    let uvArea = fround(fround(firstUvEdgeX * secondUvEdgeY) - fround(firstUvEdgeY * secondUvEdgeX));
    if (uvArea === 0) uvArea = 1;
    const inverseUvArea = fround(1 / uvArea);

    // The direction along the texture's U axis from the two edges and their UV deltas, negated.
    const triangleTangentX = -fround(fround(fround(firstEdgeX * secondUvEdgeY) + fround(secondEdgeX * -firstUvEdgeY)) * inverseUvArea);
    const triangleTangentY = -fround(fround(fround(firstEdgeY * secondUvEdgeY) + fround(secondEdgeY * -firstUvEdgeY)) * inverseUvArea);
    const triangleTangentZ = -fround(fround(fround(firstEdgeZ * secondUvEdgeY) + fround(secondEdgeZ * -firstUvEdgeY)) * inverseUvArea);
    const tangentLengthSquared = dot(triangleTangentX, triangleTangentY, triangleTangentZ, triangleTangentX, triangleTangentY, triangleTangentZ);
    // The smallest normal Float32.
    if (tangentLengthSquared > fround(1.175494351e-38)) {
      const inverseTangentLength = fround(1 / sqrt(tangentLengthSquared));
      setVector(
        tangents,
        triangle * 3,
        fround(triangleTangentX * inverseTangentLength),
        fround(triangleTangentY * inverseTangentLength),
        fround(triangleTangentZ * inverseTangentLength),
      );
    }
  }

  // Every vertex's rotation from the sum of its triangles' frames, each flipped to agree with the vertex.
  for (let vertex = 0; vertex < simulation.particleCount; vertex++) {
    const adjacentTriangles = mesh.vertexTriangles[vertex];
    if (!adjacentTriangles.length) continue;

    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    let tangentX = 0;
    let tangentY = 0;
    let tangentZ = 0;
    for (let entry = 0; entry < adjacentTriangles.length; entry++) {
      const adjacent = adjacentTriangles[entry];
      const triangle = adjacent.triangle;
      const flip = adjacent.flip;
      const triangleOffset = triangle * 3;
      const normalSign = flip & 1 ? -1 : 1;
      const tangentSign = flip & 2 ? -1 : 1;
      normalX = fround(normalX + fround(normals[triangleOffset] * normalSign));
      normalY = fround(normalY + fround(normals[triangleOffset + 1] * normalSign));
      normalZ = fround(normalZ + fround(normals[triangleOffset + 2] * normalSign));
      tangentX = fround(tangentX + fround(tangents[triangleOffset] * tangentSign));
      tangentY = fround(tangentY + fround(tangents[triangleOffset + 1] * tangentSign));
      tangentZ = fround(tangentZ + fround(tangents[triangleOffset + 2] * tangentSign));
    }

    const normalLength = sqrt(dot(normalX, normalY, normalZ, normalX, normalY, normalZ));
    const tangentLength = sqrt(dot(tangentX, tangentY, tangentZ, tangentX, tangentY, tangentZ));
    if (!(normalLength > fround(1e-6) && tangentLength > fround(1e-6))) continue;
    normalX = fround(normalX / normalLength);
    normalY = fround(normalY / normalLength);
    normalZ = fround(normalZ / normalLength);
    tangentX = fround(tangentX / tangentLength);
    tangentY = fround(tangentY / tangentLength);
    tangentZ = fround(tangentZ / tangentLength);
    // A tangent parallel to the normal defines no frame.
    const normalTangentCosine = dot(normalX, normalY, normalZ, tangentX, tangentY, tangentZ);
    if (normalTangentCosine === 1 || normalTangentCosine === -1) continue;

    // The rotation looks along normal × tangent with the normal as up.
    cross(normalX, normalY, normalZ, tangentX, tangentY, tangentZ);
    normalizeAt(RESULT, 0);
    INPUT[0] = normalX;
    INPUT[1] = normalY;
    INPUT[2] = normalZ;
    lookRotationAt(RESULT, 0, INPUT, 0);
    if (corrections.length) {
      const correction = corrections[vertex];
      INPUT[0] = correction[0];
      INPUT[1] = correction[1];
      INPUT[2] = correction[2];
      INPUT[3] = correction[3];
      multiplyQuaternionsAt(LOOK_ROTATION, 0, INPUT, 0);
      setQuaternion(simulation.rotations, vertex * 4, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
    } else setQuaternion(simulation.rotations, vertex * 4, LOOK_ROTATION[0], LOOK_ROTATION[1], LOOK_ROTATION[2], LOOK_ROTATION[3]);
  }
}

// Dihedral-angle and volume corrections, written into BEND_CORRECTIONS[0..11].
const BEND_CORRECTIONS = new Float64Array(12);
// What dihedralCorrections and volumeCorrections read for a pair: the inverse masses of its four particles in their
// order, then the rest angle or volume and the stiffness.
const BEND_INPUTS = new Float64Array(6);
const sign = (value: number): number => (value > 0 ? 1 : 0) - (value < 0 ? 1 : 0);

// A bending pair is two triangles sharing an edge: the particle of each triangle opposite the edge, then the edge's two
// ends. Writes each particle's correction toward the rest angle into BEND_CORRECTIONS, three values per particle in
// that order, using the position-based dihedral bending gradients. Returns false for a degenerate pair.
function dihedralCorrections(
  pairSign: number,
  positions: Float64Array,
  firstOpposite: number,
  secondOpposite: number,
  edgeStart: number,
  edgeEnd: number,
  inputs: Float64Array,
): boolean {
  // The vector helpers are written out: this runs for every bending pair, several times per frame.
  const firstOppositeOffset = firstOpposite * 3;
  const secondOppositeOffset = secondOpposite * 3;
  const edgeStartOffset = edgeStart * 3;
  const edgeEndOffset = edgeEnd * 3;
  const firstOppositeX = positions[firstOppositeOffset];
  const firstOppositeY = positions[firstOppositeOffset + 1];
  const firstOppositeZ = positions[firstOppositeOffset + 2];
  const secondOppositeX = positions[secondOppositeOffset];
  const secondOppositeY = positions[secondOppositeOffset + 1];
  const secondOppositeZ = positions[secondOppositeOffset + 2];
  const edgeStartX = positions[edgeStartOffset];
  const edgeStartY = positions[edgeStartOffset + 1];
  const edgeStartZ = positions[edgeStartOffset + 2];
  const edgeEndX = positions[edgeEndOffset];
  const edgeEndY = positions[edgeEndOffset + 1];
  const edgeEndZ = positions[edgeEndOffset + 2];

  const edgeX = fround(edgeEndX - edgeStartX);
  const edgeY = fround(edgeEndY - edgeStartY);
  const edgeZ = fround(edgeEndZ - edgeStartZ);
  const edgeLength = fround(Math.sqrt(fround(fround(fround(edgeX * edgeX) + fround(edgeY * edgeY)) + fround(edgeZ * edgeZ))));
  if (edgeLength < EPSILON) return false;
  const inverseEdgeLength = fround(1 / edgeLength);

  // Each triangle's normal: the cross product of the edges from its opposite particle to the edge ends.
  const firstToEdgeStartX = fround(edgeStartX - firstOppositeX);
  const firstToEdgeStartY = fround(edgeStartY - firstOppositeY);
  const firstToEdgeStartZ = fround(edgeStartZ - firstOppositeZ);
  const firstToEdgeEndX = fround(edgeEndX - firstOppositeX);
  const firstToEdgeEndY = fround(edgeEndY - firstOppositeY);
  const firstToEdgeEndZ = fround(edgeEndZ - firstOppositeZ);
  let firstNormalX = fround(fround(firstToEdgeStartY * firstToEdgeEndZ) - fround(firstToEdgeStartZ * firstToEdgeEndY));
  let firstNormalY = fround(fround(firstToEdgeStartZ * firstToEdgeEndX) - fround(firstToEdgeStartX * firstToEdgeEndZ));
  let firstNormalZ = fround(fround(firstToEdgeStartX * firstToEdgeEndY) - fround(firstToEdgeStartY * firstToEdgeEndX));
  const secondToEdgeEndX = fround(edgeEndX - secondOppositeX);
  const secondToEdgeEndY = fround(edgeEndY - secondOppositeY);
  const secondToEdgeEndZ = fround(edgeEndZ - secondOppositeZ);
  const secondToEdgeStartX = fround(edgeStartX - secondOppositeX);
  const secondToEdgeStartY = fround(edgeStartY - secondOppositeY);
  const secondToEdgeStartZ = fround(edgeStartZ - secondOppositeZ);
  let secondNormalX = fround(fround(secondToEdgeEndY * secondToEdgeStartZ) - fround(secondToEdgeEndZ * secondToEdgeStartY));
  let secondNormalY = fround(fround(secondToEdgeEndZ * secondToEdgeStartX) - fround(secondToEdgeEndX * secondToEdgeStartZ));
  let secondNormalZ = fround(fround(secondToEdgeEndX * secondToEdgeStartY) - fround(secondToEdgeEndY * secondToEdgeStartX));

  // The gradients use each normal divided by its squared length.
  const firstNormalLengthSquared = fround(
    fround(fround(firstNormalX * firstNormalX) + fround(firstNormalY * firstNormalY)) + fround(firstNormalZ * firstNormalZ),
  );
  const secondNormalLengthSquared = fround(
    fround(fround(secondNormalX * secondNormalX) + fround(secondNormalY * secondNormalY)) + fround(secondNormalZ * secondNormalZ),
  );
  if (firstNormalLengthSquared === 0 || secondNormalLengthSquared === 0) return false;
  firstNormalX = fround(firstNormalX / firstNormalLengthSquared);
  firstNormalY = fround(firstNormalY / firstNormalLengthSquared);
  firstNormalZ = fround(firstNormalZ / firstNormalLengthSquared);
  secondNormalX = fround(secondNormalX / secondNormalLengthSquared);
  secondNormalY = fround(secondNormalY / secondNormalLengthSquared);
  secondNormalZ = fround(secondNormalZ / secondNormalLengthSquared);

  // The gradient of the dihedral angle at each particle. The edge ends mix both normals, weighted by where the
  // opposite particles project onto the edge.
  const firstOppositeGradientX = fround(firstNormalX * edgeLength);
  const firstOppositeGradientY = fround(firstNormalY * edgeLength);
  const firstOppositeGradientZ = fround(firstNormalZ * edgeLength);
  const secondOppositeGradientX = fround(secondNormalX * edgeLength);
  const secondOppositeGradientY = fround(secondNormalY * edgeLength);
  const secondOppositeGradientZ = fround(secondNormalZ * edgeLength);
  const edgeStartFirstWeight = fround(
    fround(
      fround(fround(fround(firstOppositeX - edgeEndX) * edgeX) + fround(fround(firstOppositeY - edgeEndY) * edgeY)) +
        fround(fround(firstOppositeZ - edgeEndZ) * edgeZ),
    ) * inverseEdgeLength,
  );
  const edgeStartSecondWeight = fround(
    fround(
      fround(fround(fround(secondOppositeX - edgeEndX) * edgeX) + fround(fround(secondOppositeY - edgeEndY) * edgeY)) +
        fround(fround(secondOppositeZ - edgeEndZ) * edgeZ),
    ) * inverseEdgeLength,
  );
  const edgeStartGradientX = fround(fround(firstNormalX * edgeStartFirstWeight) + fround(secondNormalX * edgeStartSecondWeight));
  const edgeStartGradientY = fround(fround(firstNormalY * edgeStartFirstWeight) + fround(secondNormalY * edgeStartSecondWeight));
  const edgeStartGradientZ = fround(fround(firstNormalZ * edgeStartFirstWeight) + fround(secondNormalZ * edgeStartSecondWeight));
  const edgeEndFirstWeight = fround(
    fround(fround(fround(firstToEdgeStartX * edgeX) + fround(firstToEdgeStartY * edgeY)) + fround(firstToEdgeStartZ * edgeZ)) * inverseEdgeLength,
  );
  const edgeEndSecondWeight = fround(
    fround(fround(fround(secondToEdgeStartX * edgeX) + fround(secondToEdgeStartY * edgeY)) + fround(secondToEdgeStartZ * edgeZ)) * inverseEdgeLength,
  );
  const edgeEndGradientX = fround(fround(firstNormalX * edgeEndFirstWeight) + fround(secondNormalX * edgeEndSecondWeight));
  const edgeEndGradientY = fround(fround(firstNormalY * edgeEndFirstWeight) + fround(secondNormalY * edgeEndSecondWeight));
  const edgeEndGradientZ = fround(fround(firstNormalZ * edgeEndFirstWeight) + fround(secondNormalZ * edgeEndSecondWeight));

  // The current angle between the unit normals.
  const firstInverseLength = fround(
    1 / fround(Math.sqrt(fround(fround(fround(firstNormalX * firstNormalX) + fround(firstNormalY * firstNormalY)) + fround(firstNormalZ * firstNormalZ)))),
  );
  firstNormalX = fround(firstNormalX * firstInverseLength);
  firstNormalY = fround(firstNormalY * firstInverseLength);
  firstNormalZ = fround(firstNormalZ * firstInverseLength);
  const secondInverseLength = fround(
    1 /
      fround(Math.sqrt(fround(fround(fround(secondNormalX * secondNormalX) + fround(secondNormalY * secondNormalY)) + fround(secondNormalZ * secondNormalZ)))),
  );
  secondNormalX = fround(secondNormalX * secondInverseLength);
  secondNormalY = fround(secondNormalY * secondInverseLength);
  secondNormalZ = fround(secondNormalZ * secondInverseLength);
  const cosine = fround(fround(fround(firstNormalX * secondNormalX) + fround(firstNormalY * secondNormalY)) + fround(firstNormalZ * secondNormalZ));
  let angle = fround(Math.acos(cosine < -1 ? -1 : cosine > 1 ? 1 : cosine));

  // lambda starts as the sum of each inverse mass times its squared gradient length.
  const firstOppositeInverseMass = inputs[0];
  const secondOppositeInverseMass = inputs[1];
  const edgeStartInverseMass = inputs[2];
  const edgeEndInverseMass = inputs[3];
  let lambda = fround(
    fround(
      fround(
        fround(
          firstOppositeInverseMass *
            fround(
              fround(fround(firstOppositeGradientX * firstOppositeGradientX) + fround(firstOppositeGradientY * firstOppositeGradientY)) +
                fround(firstOppositeGradientZ * firstOppositeGradientZ),
            ),
        ) +
          fround(
            secondOppositeInverseMass *
              fround(
                fround(fround(secondOppositeGradientX * secondOppositeGradientX) + fround(secondOppositeGradientY * secondOppositeGradientY)) +
                  fround(secondOppositeGradientZ * secondOppositeGradientZ),
              ),
          ),
      ) +
        fround(
          edgeStartInverseMass *
            fround(
              fround(fround(edgeStartGradientX * edgeStartGradientX) + fround(edgeStartGradientY * edgeStartGradientY)) +
                fround(edgeStartGradientZ * edgeStartGradientZ),
            ),
        ),
    ) +
      fround(
        edgeEndInverseMass *
          fround(
            fround(fround(edgeEndGradientX * edgeEndGradientX) + fround(edgeEndGradientY * edgeEndGradientY)) + fround(edgeEndGradientZ * edgeEndGradientZ),
          ),
      ),
  );
  if (lambda === 0) return false;

  // The fold direction: the sign of (first normal × second normal) along the edge. A signed pair compares the signed
  // angle with its signed rest angle; otherwise the sign goes into lambda.
  const normalCrossX = fround(fround(firstNormalY * secondNormalZ) - fround(firstNormalZ * secondNormalY));
  const normalCrossY = fround(fround(firstNormalZ * secondNormalX) - fround(firstNormalX * secondNormalZ));
  const normalCrossZ = fround(fround(firstNormalX * secondNormalY) - fround(firstNormalY * secondNormalX));
  const direction = fround(fround(fround(normalCrossX * edgeX) + fround(normalCrossY * edgeY)) + fround(normalCrossZ * edgeZ));
  const directionSign = (direction > 0 ? 1 : 0) - (direction < 0 ? 1 : 0);
  if (pairSign !== 0) angle = fround(angle * directionSign);
  else lambda = fround(lambda * directionSign);
  const restAngle = inputs[4];
  const stiffness = inputs[5];
  lambda = fround(fround(fround(restAngle - angle) / lambda) * stiffness);

  const firstOppositeFactor = fround(-firstOppositeInverseMass * lambda);
  const secondOppositeFactor = fround(-secondOppositeInverseMass * lambda);
  const edgeStartFactor = fround(-edgeStartInverseMass * lambda);
  const edgeEndFactor = fround(-edgeEndInverseMass * lambda);
  BEND_CORRECTIONS[0] = fround(firstOppositeGradientX * firstOppositeFactor);
  BEND_CORRECTIONS[1] = fround(firstOppositeGradientY * firstOppositeFactor);
  BEND_CORRECTIONS[2] = fround(firstOppositeGradientZ * firstOppositeFactor);
  BEND_CORRECTIONS[3] = fround(secondOppositeGradientX * secondOppositeFactor);
  BEND_CORRECTIONS[4] = fround(secondOppositeGradientY * secondOppositeFactor);
  BEND_CORRECTIONS[5] = fround(secondOppositeGradientZ * secondOppositeFactor);
  BEND_CORRECTIONS[6] = fround(edgeStartGradientX * edgeStartFactor);
  BEND_CORRECTIONS[7] = fround(edgeStartGradientY * edgeStartFactor);
  BEND_CORRECTIONS[8] = fround(edgeStartGradientZ * edgeStartFactor);
  BEND_CORRECTIONS[9] = fround(edgeEndGradientX * edgeEndFactor);
  BEND_CORRECTIONS[10] = fround(edgeEndGradientY * edgeEndFactor);
  BEND_CORRECTIONS[11] = fround(edgeEndGradientZ * edgeEndFactor);
  return true;
}

// The same four particles as a tetrahedron: writes the corrections toward the rest volume into BEND_CORRECTIONS, in
// the order of dihedralCorrections. Returns false for a degenerate tetrahedron, whose gradients nearly vanish.
function volumeCorrections(
  positions: Float64Array,
  firstOpposite: number,
  secondOpposite: number,
  edgeStart: number,
  edgeEnd: number,
  inputs: Float64Array,
): boolean {
  const firstOppositeOffset = firstOpposite * 3;
  const secondOppositeOffset = secondOpposite * 3;
  const edgeStartOffset = edgeStart * 3;
  const edgeEndOffset = edgeEnd * 3;

  // Each gradient is the volume's gradient at that particle without the 1/6 factor: the cross product of two edges
  // of the opposite face.
  cross(
    fround(positions[secondOppositeOffset] - positions[firstOppositeOffset]),
    fround(positions[secondOppositeOffset + 1] - positions[firstOppositeOffset + 1]),
    fround(positions[secondOppositeOffset + 2] - positions[firstOppositeOffset + 2]),
    fround(positions[edgeStartOffset] - positions[firstOppositeOffset]),
    fround(positions[edgeStartOffset + 1] - positions[firstOppositeOffset + 1]),
    fround(positions[edgeStartOffset + 2] - positions[firstOppositeOffset + 2]),
  );
  const edgeEndGradientX = RESULT[0];
  const edgeEndGradientY = RESULT[1];
  const edgeEndGradientZ = RESULT[2];

  // The signed volume, a sixth of the triple product, scaled by 1000 like the stored rest volume.
  let volume = fround(
    fround(1 / 6) *
      dot(
        edgeEndGradientX,
        edgeEndGradientY,
        edgeEndGradientZ,
        fround(positions[edgeEndOffset] - positions[firstOppositeOffset]),
        fround(positions[edgeEndOffset + 1] - positions[firstOppositeOffset + 1]),
        fround(positions[edgeEndOffset + 2] - positions[firstOppositeOffset + 2]),
      ),
  );
  volume = fround(volume * 1000);

  cross(
    fround(positions[secondOppositeOffset] - positions[edgeStartOffset]),
    fround(positions[secondOppositeOffset + 1] - positions[edgeStartOffset + 1]),
    fround(positions[secondOppositeOffset + 2] - positions[edgeStartOffset + 2]),
    fround(positions[edgeEndOffset] - positions[edgeStartOffset]),
    fround(positions[edgeEndOffset + 1] - positions[edgeStartOffset + 1]),
    fround(positions[edgeEndOffset + 2] - positions[edgeStartOffset + 2]),
  );
  const firstOppositeGradientX = RESULT[0];
  const firstOppositeGradientY = RESULT[1];
  const firstOppositeGradientZ = RESULT[2];
  cross(
    fround(positions[edgeStartOffset] - positions[firstOppositeOffset]),
    fround(positions[edgeStartOffset + 1] - positions[firstOppositeOffset + 1]),
    fround(positions[edgeStartOffset + 2] - positions[firstOppositeOffset + 2]),
    fround(positions[edgeEndOffset] - positions[firstOppositeOffset]),
    fround(positions[edgeEndOffset + 1] - positions[firstOppositeOffset + 1]),
    fround(positions[edgeEndOffset + 2] - positions[firstOppositeOffset + 2]),
  );
  const secondOppositeGradientX = RESULT[0];
  const secondOppositeGradientY = RESULT[1];
  const secondOppositeGradientZ = RESULT[2];
  cross(
    fround(positions[firstOppositeOffset] - positions[secondOppositeOffset]),
    fround(positions[firstOppositeOffset + 1] - positions[secondOppositeOffset + 1]),
    fround(positions[firstOppositeOffset + 2] - positions[secondOppositeOffset + 2]),
    fround(positions[edgeEndOffset] - positions[secondOppositeOffset]),
    fround(positions[edgeEndOffset + 1] - positions[secondOppositeOffset + 1]),
    fround(positions[edgeEndOffset + 2] - positions[secondOppositeOffset + 2]),
  );
  const edgeStartGradientX = RESULT[0];
  const edgeStartGradientY = RESULT[1];
  const edgeStartGradientZ = RESULT[2];

  // lambda starts as the sum of each inverse mass times its squared gradient length, scaled like the volume.
  let lambda = fround(
    fround(
      fround(
        fround(
          inputs[0] *
            dot(firstOppositeGradientX, firstOppositeGradientY, firstOppositeGradientZ, firstOppositeGradientX, firstOppositeGradientY, firstOppositeGradientZ),
        ) +
          fround(
            inputs[1] *
              dot(
                secondOppositeGradientX,
                secondOppositeGradientY,
                secondOppositeGradientZ,
                secondOppositeGradientX,
                secondOppositeGradientY,
                secondOppositeGradientZ,
              ),
          ),
      ) + fround(inputs[2] * dot(edgeStartGradientX, edgeStartGradientY, edgeStartGradientZ, edgeStartGradientX, edgeStartGradientY, edgeStartGradientZ)),
    ) + fround(inputs[3] * dot(edgeEndGradientX, edgeEndGradientY, edgeEndGradientZ, edgeEndGradientX, edgeEndGradientY, edgeEndGradientZ)),
  );
  lambda = fround(lambda * 1000);
  if (Math.abs(lambda) < fround(1e-6)) return false;
  const restVolume = inputs[4];
  const stiffness = inputs[5];
  lambda = fround(fround(stiffness * fround(restVolume - volume)) / lambda);

  const firstOppositeFactor = fround(lambda * inputs[0]);
  const secondOppositeFactor = fround(lambda * inputs[1]);
  const edgeStartFactor = fround(lambda * inputs[2]);
  const edgeEndFactor = fround(lambda * inputs[3]);
  BEND_CORRECTIONS[0] = fround(firstOppositeGradientX * firstOppositeFactor);
  BEND_CORRECTIONS[1] = fround(firstOppositeGradientY * firstOppositeFactor);
  BEND_CORRECTIONS[2] = fround(firstOppositeGradientZ * firstOppositeFactor);
  BEND_CORRECTIONS[3] = fround(secondOppositeGradientX * secondOppositeFactor);
  BEND_CORRECTIONS[4] = fround(secondOppositeGradientY * secondOppositeFactor);
  BEND_CORRECTIONS[5] = fround(secondOppositeGradientZ * secondOppositeFactor);
  BEND_CORRECTIONS[6] = fround(edgeStartGradientX * edgeStartFactor);
  BEND_CORRECTIONS[7] = fround(edgeStartGradientY * edgeStartFactor);
  BEND_CORRECTIONS[8] = fround(edgeStartGradientZ * edgeStartFactor);
  BEND_CORRECTIONS[9] = fround(edgeEndGradientX * edgeEndFactor);
  BEND_CORRECTIONS[10] = fround(edgeEndGradientY * edgeEndFactor);
  BEND_CORRECTIONS[11] = fround(edgeEndGradientZ * edgeEndFactor);
  return true;
}

export function solveBending(simulation: SimulatedCloth, frequencyScale: FrequencyScale): void {
  if (!simulation.bendingData) return;
  const mesh = simulation.mesh;
  const attributes = mesh.attributes;
  const depths = mesh.depths;
  const bendingData = simulation.bendingData;
  const nextPositions = simulation.nextPositions;
  const correctionCounts = simulation.accumulator.count;
  const correctionSums = simulation.accumulator.sum;
  let stiffness = simulation.parameters.bending.stiffness;
  if (stiffness < fround(1e-6)) return;
  stiffness = saturate(fround(stiffness * frequencyScale[1]));
  BEND_INPUTS[5] = stiffness;

  // Fixed particles get an inverse mass of 0.01; friction and closeness to the root make the others heavier.
  const particleInverseMasses = particleBuffer(simulation, BUFFER_MASS);
  for (let particle = 0; particle < simulation.particleCount; particle++) {
    if (isNotSimulated(attributes[particle])) particleInverseMasses[particle] = fround(0.01);
    else {
      let mass = fround(1 + fround(simulation.frictions[particle] * fround(3)));
      const rootCloseness = fround(1 - depths[particle]);
      mass = fround(mass + fround(fround(rootCloseness * rootCloseness) * fround(5)));
      particleInverseMasses[particle] = fround(1 / mass);
    }
  }

  // Corrections add up in fixed point, so their totals do not depend on the order of the pairs.
  for (let pair = 0; pair < bendingData.pairs.length; pair++) {
    const pairParticles = bendingData.pairs[pair];
    const firstOpposite = pairParticles[0];
    const secondOpposite = pairParticles[1];
    const edgeStart = pairParticles[2];
    const edgeEnd = pairParticles[3];
    BEND_INPUTS[0] = particleInverseMasses[firstOpposite];
    BEND_INPUTS[1] = particleInverseMasses[secondOpposite];
    BEND_INPUTS[2] = particleInverseMasses[edgeStart];
    BEND_INPUTS[3] = particleInverseMasses[edgeEnd];
    const pairSign = bendingData.sign[pair];
    let corrected;
    if (pairSign === VOLUME_SIGN) {
      BEND_INPUTS[4] = fround(bendingData.rest[pair] * simulation.timing.worldScaleRatio);
      corrected = volumeCorrections(nextPositions, firstOpposite, secondOpposite, edgeStart, edgeEnd, BEND_INPUTS);
    } else {
      BEND_INPUTS[4] = fround(bendingData.rest[pair] * (pairSign < 0 ? -1 : 1));
      corrected = dihedralCorrections(pairSign < 0 ? -1 : 1, nextPositions, firstOpposite, secondOpposite, edgeStart, edgeEnd, BEND_INPUTS);
    }
    if (corrected)
      for (let corner = 0; corner < 4; corner++) {
        const particle = pairParticles[corner];
        const positionOffset = particle * 3;
        const correctionOffset = corner * 3;
        correctionCounts[particle]++;
        correctionSums[positionOffset] = (correctionSums[positionOffset] + toFixedPoint(BEND_CORRECTIONS[correctionOffset])) | 0;
        correctionSums[positionOffset + 1] = (correctionSums[positionOffset + 1] + toFixedPoint(BEND_CORRECTIONS[correctionOffset + 1])) | 0;
        correctionSums[positionOffset + 2] = (correctionSums[positionOffset + 2] + toFixedPoint(BEND_CORRECTIONS[correctionOffset + 2])) | 0;
      }
  }

  // Each moving particle moves by the average of its corrections; then the accumulator is cleared.
  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const positionOffset = particle * 3;
    if (!isNotSimulated(attributes[particle]) && correctionCounts[particle] > 0) {
      const count = Math.fround(correctionCounts[particle]);
      nextPositions[positionOffset] = fround(
        nextPositions[positionOffset] + Math.fround(Math.fround(Math.fround(correctionSums[positionOffset]) / count) * FIXED_POINT_SCALE),
      );
      nextPositions[positionOffset + 1] = fround(
        nextPositions[positionOffset + 1] + Math.fround(Math.fround(Math.fround(correctionSums[positionOffset + 1]) / count) * FIXED_POINT_SCALE),
      );
      nextPositions[positionOffset + 2] = fround(
        nextPositions[positionOffset + 2] + Math.fround(Math.fround(Math.fround(correctionSums[positionOffset + 2]) / count) * FIXED_POINT_SCALE),
      );
    }
    correctionCounts[particle] = 0;
    correctionSums[positionOffset] = 0;
    correctionSums[positionOffset + 1] = 0;
    correctionSums[positionOffset + 2] = 0;
  }
}

// The colliders whose swept bounds can reach this simulation's particle box this step. Every per-particle or per-edge
// box lies inside the simulation box, so skipping the other colliders changes nothing.
export function nearColliders(simulation: SimulatedCloth): ClothCollider[] {
  const nextPositions = simulation.nextPositions;
  const radiusCurve = simulation.parameters.radiusCurve;
  const activeColliders = simulation.activeColliders;

  // The margin covers the particle radius, which never exceeds the radius curve's largest sample.
  let largestRadius = 0.0001;
  for (let sample = 0; sample < 16; sample++) if (radiusCurve[sample] > largestRadius) largestRadius = radiusCurve[sample];
  const padding = 2 * largestRadius * simulation.timing.worldScaleRatio + 1e-3;

  let minimumX = Infinity;
  let minimumY = Infinity;
  let minimumZ = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  let maximumZ = -Infinity;
  for (let particleOffset = 0; particleOffset < simulation.particleCount * 3; particleOffset += 3) {
    const positionX = nextPositions[particleOffset];
    const positionY = nextPositions[particleOffset + 1];
    const positionZ = nextPositions[particleOffset + 2];
    if (positionX < minimumX) minimumX = positionX;
    if (positionX > maximumX) maximumX = positionX;
    if (positionY < minimumY) minimumY = positionY;
    if (positionY > maximumY) maximumY = positionY;
    if (positionZ < minimumZ) minimumZ = positionZ;
    if (positionZ > maximumZ) maximumZ = positionZ;
  }
  minimumX -= padding;
  minimumY -= padding;
  minimumZ -= padding;
  maximumX += padding;
  maximumY += padding;
  maximumZ += padding;

  activeColliders.length = 0;
  for (const collider of simulation.colliders) {
    const work = collider.work;
    if (!work) continue;
    const bounds = work.bounds;
    if (
      bounds.maximum[0] < minimumX ||
      bounds.minimum[0] > maximumX ||
      bounds.maximum[1] < minimumY ||
      bounds.minimum[1] > maximumY ||
      bounds.maximum[2] < minimumZ ||
      bounds.minimum[2] > maximumZ
    )
      continue;
    activeColliders.push(collider);
  }
  return activeColliders;
}

// Pulls each moving particle along the line to its root while its root distance lies outside the range allowed around
// the step pose root distance.
export function tether(simulation: SimulatedCloth): void {
  const mesh = simulation.mesh;
  const tetherParameters = simulation.parameters.tether;
  const nextPositions = simulation.nextPositions;
  const velocityOrigins = simulation.velocityOrigins;
  const stepPosePositions = simulation.stepPosePositions;
  // The smallest and largest allowed ratio of the root distance to the step pose root distance.
  const compressionLimit = fround(1 - tetherParameters.compressionLimit);
  const stretchLimit = fround(1 + tetherParameters.stretchLimit);

  for (let particle = 0; particle < simulation.particleCount; particle++) {
    if (!isSimulated(mesh.attributes[particle])) continue;
    const root = mesh.rootIndices[particle];
    if (root < 0) continue;

    const particleOffset = particle * 3;
    const rootOffset = root * 3;
    const toRootX = fround(nextPositions[rootOffset] - nextPositions[particleOffset]);
    const toRootY = fround(nextPositions[rootOffset + 1] - nextPositions[particleOffset + 1]);
    const toRootZ = fround(nextPositions[rootOffset + 2] - nextPositions[particleOffset + 2]);
    const distance = sqrt(dot(toRootX, toRootY, toRootZ, toRootX, toRootY, toRootZ));
    if (distance < EPSILON) continue;

    const poseToRootX = fround(stepPosePositions[rootOffset] - stepPosePositions[particleOffset]);
    const poseToRootY = fround(stepPosePositions[rootOffset + 1] - stepPosePositions[particleOffset + 1]);
    const poseToRootZ = fround(stepPosePositions[rootOffset + 2] - stepPosePositions[particleOffset + 2]);
    const poseDistance = sqrt(dot(poseToRootX, poseToRootY, poseToRootZ, poseToRootX, poseToRootY, poseToRootZ));
    if (poseDistance === 0) continue;

    // The excess is the signed distance past the crossed limit: negative when compressed, positive when stretched.
    // The stiffness reaches 1 once the ratio is 0.3 past the limit.
    const ratio = fround(distance / poseDistance);
    let excess;
    let stiffness;
    if (ratio < compressionLimit) {
      excess = fround(distance - fround(compressionLimit * poseDistance));
      stiffness = saturate(fround(fround(compressionLimit - ratio) / fround(0.3)));
    } else if (ratio > stretchLimit) {
      excess = fround(distance - fround(stretchLimit * poseDistance));
      stiffness = saturate(fround(fround(ratio - stretchLimit) / fround(0.3)));
    } else continue;

    const correctionLength = fround(excess * stiffness);
    const attenuation = fround(0.7);
    const correctionX = fround(fround(toRootX / distance) * correctionLength);
    const correctionY = fround(fround(toRootY / distance) * correctionLength);
    const correctionZ = fround(fround(toRootZ / distance) * correctionLength);
    nextPositions[particleOffset] = fround(nextPositions[particleOffset] + correctionX);
    nextPositions[particleOffset + 1] = fround(nextPositions[particleOffset + 1] + correctionY);
    nextPositions[particleOffset + 2] = fround(nextPositions[particleOffset + 2] + correctionZ);
    // Moving the velocity origin with most of the correction keeps that part from turning into velocity.
    velocityOrigins[particleOffset] = fround(velocityOrigins[particleOffset] + fround(correctionX * attenuation));
    velocityOrigins[particleOffset + 1] = fround(velocityOrigins[particleOffset + 1] + fround(correctionY * attenuation));
    velocityOrigins[particleOffset + 2] = fround(velocityOrigins[particleOffset + 2] + fround(correctionZ * attenuation));
  }
}

// Applies collision friction, the speed limit and the centrifugal push, then stores the step's velocities and
// positions.
export function finishStep(simulation: SimulatedCloth, simulationDeltaTime: number): void {
  const mesh = simulation.mesh;
  const attributes = mesh.attributes;
  const parameters = simulation.parameters;
  const timing = simulation.timing;
  const center = simulation.center;
  const staticFrictionSpeed = fround(parameters.collider.staticFriction * timing.worldScaleRatio);
  const dynamicFriction = parameters.collider.dynamicFriction;
  const speedLimit = parameters.inertia.particleSpeedLimit;
  const maximumSpeed = fround(speedLimit * timing.worldScaleRatio);
  const rotationAxis = center.rotationAxis;
  const centerPosition = center.stepCenterPosition;
  const angularVelocity = center.angularVelocity;
  const centrifugalShare = parameters.inertia.centrifugalShare;
  const appliesCentrifugal =
    angularVelocity > EPSILON &&
    centrifugalShare > EPSILON &&
    dot(rotationAxis[0], rotationAxis[1], rotationAxis[2], rotationAxis[0], rotationAxis[1], rotationAxis[2]) > EPSILON;
  const nextPositions = simulation.nextPositions;
  const velocityOrigins = simulation.velocityOrigins;
  const oldPositions = simulation.oldPositions;
  const collisionNormals = simulation.collisionNormals;

  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const particleOffset = particle * 3;
    let positionX = nextPositions[particleOffset];
    let positionY = nextPositions[particleOffset + 1];
    let positionZ = nextPositions[particleOffset + 2];
    if (isSimulated(attributes[particle])) {
      let velocityOriginX = velocityOrigins[particleOffset];
      let velocityOriginY = velocityOrigins[particleOffset + 1];
      let velocityOriginZ = velocityOrigins[particleOffset + 2];
      let friction = simulation.frictions[particle];
      const isColliding =
        dot(
          collisionNormals[particleOffset],
          collisionNormals[particleOffset + 1],
          collisionNormals[particleOffset + 2],
          collisionNormals[particleOffset],
          collisionNormals[particleOffset + 1],
          collisionNormals[particleOffset + 2],
        ) > EPSILON && friction > EPSILON;

      // Static friction builds up while the particle slides slower than the static friction speed and wears off
      // otherwise. It cancels that share of the movement along the surface, in the velocity origin too, so the
      // cancelled movement adds no velocity.
      let staticFriction = simulation.staticFrictions[particle];
      if (isColliding && staticFrictionSpeed > 0) {
        const movementX = fround(positionX - oldPositions[particleOffset]);
        const movementY = fround(positionY - oldPositions[particleOffset + 1]);
        const movementZ = fround(positionZ - oldPositions[particleOffset + 2]);
        const normalMovement = dot(
          movementX,
          movementY,
          movementZ,
          collisionNormals[particleOffset],
          collisionNormals[particleOffset + 1],
          collisionNormals[particleOffset + 2],
        );
        let tangentX = fround(movementX - fround(collisionNormals[particleOffset] * normalMovement));
        let tangentY = fround(movementY - fround(collisionNormals[particleOffset + 1] * normalMovement));
        let tangentZ = fround(movementZ - fround(collisionNormals[particleOffset + 2] * normalMovement));
        const tangentSpeed = fround(sqrt(dot(tangentX, tangentY, tangentZ, tangentX, tangentY, tangentZ)) / simulationDeltaTime);
        if (tangentSpeed < staticFrictionSpeed) staticFriction = saturate(fround(staticFriction + fround(0.04)));
        else {
          const release = fround(fround(tangentSpeed - staticFrictionSpeed) / fround(0.2));
          const minimumRelease = fround(0.05);
          staticFriction = saturate(fround(staticFriction - (release > minimumRelease ? release : minimumRelease)));
        }
        tangentX = fround(tangentX * staticFriction);
        tangentY = fround(tangentY * staticFriction);
        tangentZ = fround(tangentZ * staticFriction);
        positionX = fround(positionX - tangentX);
        positionY = fround(positionY - tangentY);
        positionZ = fround(positionZ - tangentZ);
        velocityOriginX = fround(velocityOriginX - tangentX);
        velocityOriginY = fround(velocityOriginY - tangentY);
        velocityOriginZ = fround(velocityOriginZ - tangentZ);
      } else staticFriction = saturate(fround(staticFriction - fround(0.05)));
      simulation.staticFrictions[particle] = staticFriction;

      let velocityX = fround(fround(positionX - velocityOriginX) / simulationDeltaTime);
      let velocityY = fround(fround(positionY - velocityOriginY) / simulationDeltaTime);
      let velocityZ = fround(fround(positionZ - velocityOriginZ) / simulationDeltaTime);
      const squaredSpeed = dot(velocityX, velocityY, velocityZ, velocityX, velocityY, velocityZ);
      let directionX = 0;
      let directionY = 0;
      let directionZ = 0;
      if (squaredSpeed > EPSILON) {
        INPUT[0] = velocityX;
        INPUT[1] = velocityY;
        INPUT[2] = velocityZ;
        normalizeAt(INPUT, 0);
        directionX = RESULT[0];
        directionY = RESULT[1];
        directionZ = RESULT[2];
      }

      // The dynamic friction weight is 1 when the velocity points against the collision normal, 3/4 when it runs
      // along the surface and 0 when it points along the normal.
      if (isColliding && dynamicFriction > 0 && squaredSpeed >= EPSILON) {
        let frictionWeight = fround(
          0.5 +
            fround(
              0.5 *
                dot(
                  collisionNormals[particleOffset],
                  collisionNormals[particleOffset + 1],
                  collisionNormals[particleOffset + 2],
                  directionX,
                  directionY,
                  directionZ,
                ),
            ),
        );
        frictionWeight = fround(1 - fround(frictionWeight * frictionWeight));
        const damping = fround(frictionWeight * saturate(fround(friction * dynamicFriction)));
        velocityX = fround(velocityX - fround(velocityX * damping));
        velocityY = fround(velocityY - fround(velocityY * damping));
        velocityZ = fround(velocityZ - fround(velocityZ * damping));
      }
      simulation.frictions[particle] = fround(friction * fround(0.6));

      if (speedLimit >= 0) {
        const speed = sqrt(dot(velocityX, velocityY, velocityZ, velocityX, velocityY, velocityZ));
        if (speed > fround(1e-9) && speed > maximumSpeed) {
          const scale = fround(maximumSpeed / speed);
          velocityX = fround(velocityX * scale);
          velocityY = fround(velocityY * scale);
          velocityZ = fround(velocityZ * scale);
        }
      }

      // Pushes the particle away from the rotation axis by mass × angular velocity² × radius, scaled by how far its
      // velocity follows the direction of rotation (axis × outward). Particles nearer the root weigh more.
      if (appliesCentrifugal && squaredSpeed >= EPSILON) {
        const fromCenterX = fround(positionX - centerPosition[0]);
        const fromCenterY = fround(positionY - centerPosition[1]);
        const fromCenterZ = fround(positionZ - centerPosition[2]);
        const alongAxis = dot(fromCenterX, fromCenterY, fromCenterZ, rotationAxis[0], rotationAxis[1], rotationAxis[2]);
        const radialX = fround(fromCenterX - fround(rotationAxis[0] * alongAxis));
        const radialY = fround(fromCenterY - fround(rotationAxis[1] * alongAxis));
        const radialZ = fround(fromCenterZ - fround(rotationAxis[2] * alongAxis));
        const radius = sqrt(dot(radialX, radialY, radialZ, radialX, radialY, radialZ));
        if (radius > EPSILON) {
          const outwardX = fround(radialX / radius);
          const outwardY = fround(radialY / radius);
          const outwardZ = fround(radialZ / radius);
          const mass = fround(1 + fround(1 - mesh.depths[particle]));
          let force = fround(fround(fround(mass * angularVelocity) * angularVelocity) * radius);
          cross(rotationAxis[0], rotationAxis[1], rotationAxis[2], outwardX, outwardY, outwardZ);
          normalizeAt(RESULT, 0);
          force = fround(force * saturate(dot(directionX, directionY, directionZ, RESULT[0], RESULT[1], RESULT[2])));
          const speedGain = fround(fround(force * centrifugalShare) * fround(0.02));
          velocityX = fround(velocityX + fround(outwardX * speedGain));
          velocityY = fround(velocityY + fround(outwardY * speedGain));
          velocityZ = fround(velocityZ + fround(outwardZ * speedGain));
        }
      }
      setVector(
        simulation.velocities,
        particleOffset,
        fround(velocityX * timing.settleWeight),
        fround(velocityY * timing.settleWeight),
        fround(velocityZ * timing.settleWeight),
      );
    }

    setVector(
      simulation.displacementVelocities,
      particleOffset,
      fround(fround(positionX - oldPositions[particleOffset]) / simulationDeltaTime),
      fround(fround(positionY - oldPositions[particleOffset + 1]) / simulationDeltaTime),
      fround(fround(positionZ - oldPositions[particleOffset + 2]) / simulationDeltaTime),
    );
    setVector(oldPositions, particleOffset, positionX, positionY, positionZ);
  }
}

// Blends the simulated positions into the animated pose that skinning left in positions and rotations, and keeps
// that animated pose for the frame rotations and the next frame.
export function displayPosition(simulation: SimulatedCloth, simulationDeltaTime: number): void {
  const mesh = simulation.mesh;
  const attributes = mesh.attributes;
  const timing = simulation.timing;
  // Where the frame time lies between the previous frame and the end of the last step.
  const interval = fround(fround(timing.stepTime + simulationDeltaTime) - timing.oldTime);
  const frameFraction = interval > 0 ? fround(fround(timing.time - timing.oldTime) / interval) : 0;
  const influenceWeight = timing.influenceWeight;
  const rootDistanceLimit = fround(1.3);
  const positions = simulation.positions;
  const rotations = simulation.rotations;
  const oldPositions = simulation.oldPositions;
  const displacementVelocities = simulation.displacementVelocities;
  const displayPositions = simulation.displayPositions;

  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const particleOffset = particle * 3;
    const rotationOffset = particle * 4;
    const animatedX = positions[particleOffset];
    const animatedY = positions[particleOffset + 1];
    const animatedZ = positions[particleOffset + 2];
    if (isSimulated(attributes[particle])) {
      // Moves from the last display position toward the last step's position extrapolated by one more step.
      let displayX = interpolate(
        displayPositions[particleOffset],
        fround(oldPositions[particleOffset] + fround(displacementVelocities[particleOffset] * simulationDeltaTime)),
        frameFraction,
      );
      let displayY = interpolate(
        displayPositions[particleOffset + 1],
        fround(oldPositions[particleOffset + 1] + fround(displacementVelocities[particleOffset + 1] * simulationDeltaTime)),
        frameFraction,
      );
      let displayZ = interpolate(
        displayPositions[particleOffset + 2],
        fround(oldPositions[particleOffset + 2] + fround(displacementVelocities[particleOffset + 2] * simulationDeltaTime)),
        frameFraction,
      );

      // Keeps the display position within 1.3 times the animated distance from the root.
      const root = mesh.rootIndices[particle];
      if (root >= 0) {
        const rootOffset = root * 3;
        const animatedFromRootX = fround(animatedX - positions[rootOffset]);
        const animatedFromRootY = fround(animatedY - positions[rootOffset + 1]);
        const animatedFromRootZ = fround(animatedZ - positions[rootOffset + 2]);
        const maximumRootDistance = fround(
          sqrt(dot(animatedFromRootX, animatedFromRootY, animatedFromRootZ, animatedFromRootX, animatedFromRootY, animatedFromRootZ)) * rootDistanceLimit,
        );
        let fromRootX = fround(displayX - positions[rootOffset]);
        let fromRootY = fround(displayY - positions[rootOffset + 1]);
        let fromRootZ = fround(displayZ - positions[rootOffset + 2]);
        const rootDistance = sqrt(dot(fromRootX, fromRootY, fromRootZ, fromRootX, fromRootY, fromRootZ));
        if (rootDistance > fround(1e-9) && rootDistance > maximumRootDistance) {
          const scale = fround(maximumRootDistance / rootDistance);
          fromRootX = fround(fromRootX * scale);
          fromRootY = fround(fromRootY * scale);
          fromRootZ = fround(fromRootZ * scale);
        }
        displayX = fround(positions[rootOffset] + fromRootX);
        displayY = fround(positions[rootOffset + 1] + fromRootY);
        displayZ = fround(positions[rootOffset + 2] + fromRootZ);
      }
      setVector(displayPositions, particleOffset, displayX, displayY, displayZ);
      setVector(
        positions,
        particleOffset,
        interpolate(animatedX, displayX, influenceWeight),
        interpolate(animatedY, displayY, influenceWeight),
        interpolate(animatedZ, displayZ, influenceWeight),
      );
    } else setVector(displayPositions, particleOffset, animatedX, animatedY, animatedZ);

    if (timing.running) {
      setVector(simulation.inputOldPositions, particleOffset, animatedX, animatedY, animatedZ);
      setQuaternion(
        simulation.inputOldRotations,
        rotationOffset,
        rotations[rotationOffset],
        rotations[rotationOffset + 1],
        rotations[rotationOffset + 2],
        rotations[rotationOffset + 3],
      );
    }
    setVector(simulation.temporaryPositions, particleOffset, animatedX, animatedY, animatedZ);
    setQuaternion(
      simulation.temporaryRotations,
      rotationOffset,
      rotations[rotationOffset],
      rotations[rotationOffset + 1],
      rotations[rotationOffset + 2],
      rotations[rotationOffset + 3],
    );
  }
}

// fromToRotationAt for directions of any length, read with the fraction from values[offset..offset + 6] in the same
// layout.
function fromToRotationUnnormalizedAt(values: Float64Array, offset: number): void {
  const fromX = values[offset];
  const fromY = values[offset + 1];
  const fromZ = values[offset + 2];
  const toX = values[offset + 3];
  const toY = values[offset + 4];
  const toZ = values[offset + 5];
  const fraction = values[offset + 6];
  // fromToRotationAt reads the unit directions and the fraction from RESULT[8..14].
  RESULT[8] = fromX;
  RESULT[9] = fromY;
  RESULT[10] = fromZ;
  RESULT[11] = toX;
  RESULT[12] = toY;
  RESULT[13] = toZ;
  RESULT[14] = fraction;
  normalizeAt(RESULT, 8);
  RESULT[8] = RESULT[0];
  RESULT[9] = RESULT[1];
  RESULT[10] = RESULT[2];
  normalizeAt(RESULT, 11);
  RESULT[11] = RESULT[0];
  RESULT[12] = RESULT[1];
  RESULT[13] = RESULT[2];
  fromToRotationAt(RESULT, 8);
}

// Turns each line particle so the offsets to its children follow the displayed positions, sets the rotation of each
// moving child to match, then blends the particle's rotation with its animated rotation.
export function writeLineFrames(simulation: SimulatedCloth): void {
  const mesh = simulation.mesh;
  const attributes = mesh.attributes;
  const parameters = simulation.parameters;
  const timing = simulation.timing;
  const animationBlend = parameters.animationBlend;
  const rotations = simulation.rotations;
  const positions = simulation.positions;
  // displayPosition left the animated pose here.
  const temporaryPositions = simulation.temporaryPositions;
  const temporaryRotations = simulation.temporaryRotations;

  // The helpers read from INPUT: the particle's rotation at 0..3, its inverse animated rotation at 4..7, a vector at
  // 8..10, an interpolation amount at 11, the child's local rotation at 12..15, the directions and fraction of a turn
  // at 16..22 and the child's rotation at 24..27.
  for (let chain = 0; chain < mesh.chainStart.length; chain++) {
    if (!mesh.chainIncludesLine[chain]) continue;
    const chainStart = mesh.chainStart[chain];
    for (let chainEntry = 0; chainEntry < mesh.chainCount[chain]; chainEntry++) {
      const particle = mesh.chainData[chainStart + chainEntry];
      const particleOffset = particle * 3;
      const rotationOffset = particle * 4;
      const attribute = attributes[particle];
      const children = mesh.childIndices[particle];
      INPUT[0] = rotations[rotationOffset];
      INPUT[1] = rotations[rotationOffset + 1];
      INPUT[2] = rotations[rotationOffset + 2];
      INPUT[3] = rotations[rotationOffset + 3];
      if (children.length && !isExcluded(attribute)) {
        invertQuaternionAt(temporaryRotations, rotationOffset);
        INPUT[4] = RESULT[4];
        INPUT[5] = RESULT[5];
        INPUT[6] = RESULT[6];
        INPUT[7] = RESULT[7];
        INPUT[11] = animationBlend;

        // The child offsets summed twice: as the particle's rotation places them and as the positions place them.
        let rotatedOffsetSumX = 0;
        let rotatedOffsetSumY = 0;
        let rotatedOffsetSumZ = 0;
        let actualOffsetSumX = 0;
        let actualOffsetSumY = 0;
        let actualOffsetSumZ = 0;
        for (let childIndex = 0; childIndex < children.length; childIndex++) {
          const child = children[childIndex];
          const childAttribute = attributes[child];
          const coincidesWithParent = (childAttribute & Attribute.CoincidentWithParent) !== 0;
          const childOffset = child * 3;
          const childRotationOffset = child * 4;
          const vertexLocalPosition = mesh.vertexLocalPositions[child];
          const vertexLocalRotation = mesh.vertexLocalRotations[child];

          // The child's pose relative to the particle: the rest local pose blended toward the animated one.
          INPUT[8] = fround(temporaryPositions[childOffset] - temporaryPositions[particleOffset]);
          INPUT[9] = fround(temporaryPositions[childOffset + 1] - temporaryPositions[particleOffset + 1]);
          INPUT[10] = fround(temporaryPositions[childOffset + 2] - temporaryPositions[particleOffset + 2]);
          rotateVectorAt(INPUT, 4, INPUT, 8);
          const localPositionX = interpolate(vertexLocalPosition[0], RESULT[0], animationBlend);
          const localPositionY = interpolate(vertexLocalPosition[1], RESULT[1], animationBlend);
          const localPositionZ = interpolate(vertexLocalPosition[2], RESULT[2], animationBlend);
          multiplyQuaternionsAt(INPUT, 4, temporaryRotations, childRotationOffset);
          INPUT[12] = vertexLocalRotation[0];
          INPUT[13] = vertexLocalRotation[1];
          INPUT[14] = vertexLocalRotation[2];
          INPUT[15] = vertexLocalRotation[3];
          sphericalInterpolationAt(INPUT, 12, RESULT, 4, INPUT, 11);
          INPUT[12] = RESULT[4];
          INPUT[13] = RESULT[5];
          INPUT[14] = RESULT[6];
          INPUT[15] = RESULT[7];

          let rotatedOffsetX = 0;
          let rotatedOffsetY = 0;
          let rotatedOffsetZ = 0;
          if (!coincidesWithParent) {
            INPUT[8] = localPositionX;
            INPUT[9] = localPositionY;
            INPUT[10] = localPositionZ;
            rotateVectorAt(INPUT, 0, INPUT, 8);
            rotatedOffsetX = RESULT[0];
            rotatedOffsetY = RESULT[1];
            rotatedOffsetZ = RESULT[2];
          }
          rotatedOffsetSumX = fround(rotatedOffsetSumX + rotatedOffsetX);
          rotatedOffsetSumY = fround(rotatedOffsetSumY + rotatedOffsetY);
          rotatedOffsetSumZ = fround(rotatedOffsetSumZ + rotatedOffsetZ);

          if (isSimulated(childAttribute)) {
            const actualOffsetX = fround(positions[childOffset] - positions[particleOffset]);
            const actualOffsetY = fround(positions[childOffset + 1] - positions[particleOffset + 1]);
            const actualOffsetZ = fround(positions[childOffset + 2] - positions[particleOffset + 2]);
            actualOffsetSumX = fround(actualOffsetSumX + actualOffsetX);
            actualOffsetSumY = fround(actualOffsetSumY + actualOffsetY);
            actualOffsetSumZ = fround(actualOffsetSumZ + actualOffsetZ);

            // The child's local rotation under the particle's, turned so its offset follows the positions.
            multiplyQuaternionsAt(INPUT, 0, INPUT, 12);
            if (!coincidesWithParent) {
              INPUT[24] = RESULT[4];
              INPUT[25] = RESULT[5];
              INPUT[26] = RESULT[6];
              INPUT[27] = RESULT[7];
              INPUT[16] = rotatedOffsetX;
              INPUT[17] = rotatedOffsetY;
              INPUT[18] = rotatedOffsetZ;
              INPUT[19] = actualOffsetX;
              INPUT[20] = actualOffsetY;
              INPUT[21] = actualOffsetZ;
              INPUT[22] = 1;
              fromToRotationUnnormalizedAt(INPUT, 16);
              multiplyQuaternionsAt(RESULT, 4, INPUT, 24);
            }
            setQuaternion(rotations, childRotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
          } else {
            // A child that does not move counts where the particle's rotation places it.
            actualOffsetSumX = fround(actualOffsetSumX + rotatedOffsetX);
            actualOffsetSumY = fround(actualOffsetSumY + rotatedOffsetY);
            actualOffsetSumZ = fround(actualOffsetSumZ + rotatedOffsetZ);
          }
        }

        // Turns the particle by part of the rotation from the rotated child offsets to the actual ones.
        const rotationFraction = isSimulated(attribute) ? parameters.rotationFollow : parameters.rootRotationFollow;
        if (
          !(
            sqrt(dot(rotatedOffsetSumX, rotatedOffsetSumY, rotatedOffsetSumZ, rotatedOffsetSumX, rotatedOffsetSumY, rotatedOffsetSumZ)) < EPSILON ||
            sqrt(dot(actualOffsetSumX, actualOffsetSumY, actualOffsetSumZ, actualOffsetSumX, actualOffsetSumY, actualOffsetSumZ)) < EPSILON
          )
        ) {
          INPUT[16] = rotatedOffsetSumX;
          INPUT[17] = rotatedOffsetSumY;
          INPUT[18] = rotatedOffsetSumZ;
          INPUT[19] = actualOffsetSumX;
          INPUT[20] = actualOffsetSumY;
          INPUT[21] = actualOffsetSumZ;
          INPUT[22] = rotationFraction;
          fromToRotationUnnormalizedAt(INPUT, 16);
          multiplyQuaternionsAt(RESULT, 4, INPUT, 0);
        } else {
          // The identity product changes no value except possibly the sign of a zero; it stays for bit-exact results.
          multiplyQuaternionsAt(IDENTITY, 0, INPUT, 0);
        }
        INPUT[0] = RESULT[4];
        INPUT[1] = RESULT[5];
        INPUT[2] = RESULT[6];
        INPUT[3] = RESULT[7];
      }
      INPUT[11] = timing.influenceWeight;
      sphericalInterpolationAt(temporaryRotations, rotationOffset, INPUT, 0, INPUT, 11);
      setQuaternion(rotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
    }
  }
}

// Writes the output positions, the bone rotations, and each moving particle's position and rotation relative to its
// parent, with the parent's scale removed from the position.
export function outputs(simulation: SimulatedCloth, pose: PoseSource): void {
  const mesh = simulation.mesh;
  const particleToBoneRotations = mesh.particleToBoneRotations;
  const rotations = simulation.rotations;
  const outputPositions = simulation.outputPositions;
  const outputRotations = simulation.outputRotations;
  outputPositions.set(simulation.positions);
  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const rotationOffset = particle * 4;
    const particleToBone = particleToBoneRotations[particle];
    INPUT[0] = particleToBone[0];
    INPUT[1] = particleToBone[1];
    INPUT[2] = particleToBone[2];
    INPUT[3] = particleToBone[3];
    multiplyQuaternionsAt(rotations, rotationOffset, INPUT, 0);
    setQuaternion(outputRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
  }

  for (let particle = 0; particle < simulation.particleCount; particle++) {
    const parent = mesh.parentIndices[particle];
    const valid = parent >= 0 && isSimulated(mesh.attributes[particle]);
    simulation.outputLocalValid[particle] = valid ? 1 : 0;
    if (!valid) continue;

    const particleOffset = particle * 3;
    const parentOffset = parent * 3;
    const parentRotationOffset = parent * 4;
    const rotationOffset = particle * 4;
    const parentScale = pose(mesh.transformIds[parent]).scale;
    invertQuaternionAt(outputRotations, parentRotationOffset);
    // The inverse parent rotation stays in INPUT[0..3].
    INPUT[0] = RESULT[4];
    INPUT[1] = RESULT[5];
    INPUT[2] = RESULT[6];
    INPUT[3] = RESULT[7];
    INPUT[4] = fround(outputPositions[particleOffset] - outputPositions[parentOffset]);
    INPUT[5] = fround(outputPositions[particleOffset + 1] - outputPositions[parentOffset + 1]);
    INPUT[6] = fround(outputPositions[particleOffset + 2] - outputPositions[parentOffset + 2]);
    rotateVectorAt(INPUT, 0, INPUT, 4);
    setVector(
      simulation.outputLocalPositions,
      particleOffset,
      fround(RESULT[0] / parentScale[0]),
      fround(RESULT[1] / parentScale[1]),
      fround(RESULT[2] / parentScale[2]),
    );
    multiplyQuaternionsAt(INPUT, 0, outputRotations, rotationOffset);
    setQuaternion(simulation.outputLocalRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
  }
}

const smaller = (first: number, second: number): number => (first < second ? first : second);
const larger = (first: number, second: number): number => (first > second ? first : second);

// NaN makes V8 store the elements as doubles from the start, the kind that the collision kernels read.
const unsetVector = (): Vector3 => [Number.NaN, Number.NaN, Number.NaN];

// The work that prepareColliderStep fills in place. Its rotation is the collider's current rotation, which the collider
// updates in place. A sphere uses only the start positions; its end positions stay zero.
function createColliderWork(collider: ClothCollider): ColliderWork {
  const isSphere = collider.type === 1;
  return {
    type: collider.type,
    inverseOldRotation: [Number.NaN, Number.NaN, Number.NaN, Number.NaN],
    rotation: collider.currentRotation,
    radius: [Number.NaN, Number.NaN],
    bounds: { minimum: unsetVector(), maximum: unsetVector() },
    oldPositions: [unsetVector(), isSphere ? [0, 0, 0] : unsetVector()],
    nextPositions: [unsetVector(), isSphere ? [0, 0, 0] : unsetVector()],
  };
}

// Places the collider at this step and builds its sweep from the previous step: the start and end sphere centers and
// radii at both ends of the sweep, and the box around them.
export function prepareColliderStep(simulation: SimulatedCloth, collider: ClothCollider): void {
  if (!collider.enabled) {
    collider.work = null;
    return;
  }

  const timing = simulation.timing;
  const center = simulation.center;
  const stepFraction = timing.stepFraction;
  const oldFramePosition = collider.oldFramePosition;
  const framePosition = collider.framePosition;
  const oldFrameRotation = collider.oldFrameRotation;
  const frameRotation = collider.frameRotation;

  // The pose at this step, between the previous frame's and this frame's.
  const currentPositionX = interpolate(oldFramePosition[0], framePosition[0], stepFraction);
  const currentPositionY = interpolate(oldFramePosition[1], framePosition[1], stepFraction);
  const currentPositionZ = interpolate(oldFramePosition[2], framePosition[2], stepFraction);
  INPUT[0] = oldFrameRotation[0];
  INPUT[1] = oldFrameRotation[1];
  INPUT[2] = oldFrameRotation[2];
  INPUT[3] = oldFrameRotation[3];
  INPUT[4] = frameRotation[0];
  INPUT[5] = frameRotation[1];
  INPUT[6] = frameRotation[2];
  INPUT[7] = frameRotation[3];
  INPUT[8] = stepFraction;
  sphericalInterpolationAt(INPUT, 0, INPUT, 4, INPUT, 8);
  normalizeQuaternionAt(RESULT, 4);
  const currentRotationX = RESULT[4];
  const currentRotationY = RESULT[5];
  const currentRotationZ = RESULT[6];
  const currentRotationW = RESULT[7];
  const currentPosition = collider.currentPosition;
  const currentRotation = collider.currentRotation;
  currentPosition[0] = currentPositionX;
  currentPosition[1] = currentPositionY;
  currentPosition[2] = currentPositionZ;
  currentRotation[0] = currentRotationX;
  currentRotation[1] = currentRotationY;
  currentRotation[2] = currentRotationZ;
  currentRotation[3] = currentRotationW;

  // The start of the sweep: the previous step's pose moved toward the current one by the step's movement and
  // rotation inertia. It replaces the previous step's pose.
  const oldPosition = collider.oldPosition;
  const oldRotation = collider.oldRotation;
  const movementInertia = center.stepMovementInertia;
  const oldPositionX = interpolate(oldPosition[0], currentPositionX, movementInertia);
  const oldPositionY = interpolate(oldPosition[1], currentPositionY, movementInertia);
  const oldPositionZ = interpolate(oldPosition[2], currentPositionZ, movementInertia);
  // The sweep's old rotation goes to INPUT[0..3] and its current rotation to INPUT[4..7], where the helpers read them.
  INPUT[0] = oldRotation[0];
  INPUT[1] = oldRotation[1];
  INPUT[2] = oldRotation[2];
  INPUT[3] = oldRotation[3];
  INPUT[4] = currentRotationX;
  INPUT[5] = currentRotationY;
  INPUT[6] = currentRotationZ;
  INPUT[7] = currentRotationW;
  INPUT[8] = center.stepRotationInertia;
  sphericalInterpolationAt(INPUT, 0, INPUT, 4, INPUT, 8);
  INPUT[0] = RESULT[4];
  INPUT[1] = RESULT[5];
  INPUT[2] = RESULT[6];
  INPUT[3] = RESULT[7];
  oldPosition[0] = oldPositionX;
  oldPosition[1] = oldPositionY;
  oldPosition[2] = oldPositionZ;
  normalizeQuaternionAt(INPUT, 0);
  oldRotation[0] = RESULT[4];
  oldRotation[1] = RESULT[5];
  oldRotation[2] = RESULT[6];
  oldRotation[3] = RESULT[7];
  // The work is filled in place: only the collision kernels of this step read it.
  const work = collider.work ?? (collider.work = createColliderWork(collider));
  const inverseOldRotation = work.inverseOldRotation;
  invertQuaternionAt(INPUT, 0);
  inverseOldRotation[0] = RESULT[4];
  inverseOldRotation[1] = RESULT[5];
  inverseOldRotation[2] = RESULT[6];
  inverseOldRotation[3] = RESULT[7];
  const radius = work.radius;
  const minimum = work.bounds.minimum;
  const maximum = work.bounds.maximum;
  const oldStart = work.oldPositions[0];
  const nextStart = work.nextPositions[0];

  const scale = collider.frameScale;
  const size = collider.size;
  // Type 1 is a sphere, sized by the X scale.
  if (collider.type === 1) {
    const sphereRadius = fround(size[0] * Math.abs(scale[0]));
    radius[0] = sphereRadius;
    radius[1] = sphereRadius;
    minimum[0] = fround(smaller(oldPositionX, currentPositionX) - sphereRadius);
    minimum[1] = fround(smaller(oldPositionY, currentPositionY) - sphereRadius);
    minimum[2] = fround(smaller(oldPositionZ, currentPositionZ) - sphereRadius);
    maximum[0] = fround(larger(oldPositionX, currentPositionX) + sphereRadius);
    maximum[1] = fround(larger(oldPositionY, currentPositionY) + sphereRadius);
    maximum[2] = fround(larger(oldPositionZ, currentPositionZ) + sphereRadius);
    oldStart[0] = oldPositionX;
    oldStart[1] = oldPositionY;
    oldStart[2] = oldPositionZ;
    nextStart[0] = currentPositionX;
    nextStart[1] = currentPositionY;
    nextStart[2] = currentPositionZ;
    return;
  }

  // Types 2 to 4 are capsules centered on the transform along X, Y or Z; types 5 to 7 start at the transform. The
  // scale along the axis sizes the capsule, and a negative scale flips the axis.
  const type = collider.type;
  const alignedOnCenter = type >= 2 && type <= 4;
  let axisX = type === 2 || type === 5 ? 1 : 0;
  let axisY = type === 3 || type === 6 ? 1 : 0;
  let axisZ = type === 4 || type === 7 ? 1 : 0;
  const axisSignedScale = dot(scale[0], scale[1], scale[2], axisX, axisY, axisZ);
  const axisScaleSign = sign(axisSignedScale);
  axisX = fround(axisX * axisScaleSign);
  axisY = fround(axisY * axisScaleSign);
  axisZ = fround(axisZ * axisScaleSign);
  const axisScale = Math.abs(axisSignedScale);
  if (collider.reverse) {
    axisX = -axisX;
    axisY = -axisY;
    axisZ = -axisZ;
  }

  // Distances along the axis from the transform to the start and end sphere centers.
  const startRadius = fround(size[0] * axisScale);
  const endRadius = fround(size[1] * axisScale);
  const capsuleLength = fround(size[2] * axisScale);
  let startDistance = alignedOnCenter ? fround(capsuleLength * 0.5) : 0;
  let endDistance = alignedOnCenter ? fround(capsuleLength * 0.5) : fround(capsuleLength - startRadius);
  startDistance = larger(fround(startDistance - startRadius), 0);
  endDistance = larger(fround(endDistance - endRadius), 0);

  INPUT[8] = fround(axisX * startDistance);
  INPUT[9] = fround(axisY * startDistance);
  INPUT[10] = fround(axisZ * startDistance);
  rotateVectorAt(INPUT, 0, INPUT, 8);
  const oldStartX = fround(oldPositionX + RESULT[0]);
  const oldStartY = fround(oldPositionY + RESULT[1]);
  const oldStartZ = fround(oldPositionZ + RESULT[2]);
  INPUT[8] = fround(axisX * endDistance);
  INPUT[9] = fround(axisY * endDistance);
  INPUT[10] = fround(axisZ * endDistance);
  rotateVectorAt(INPUT, 0, INPUT, 8);
  const oldEndX = fround(oldPositionX - RESULT[0]);
  const oldEndY = fround(oldPositionY - RESULT[1]);
  const oldEndZ = fround(oldPositionZ - RESULT[2]);
  INPUT[8] = fround(axisX * startDistance);
  INPUT[9] = fround(axisY * startDistance);
  INPUT[10] = fround(axisZ * startDistance);
  rotateVectorAt(INPUT, 4, INPUT, 8);
  const currentStartX = fround(currentPositionX + RESULT[0]);
  const currentStartY = fround(currentPositionY + RESULT[1]);
  const currentStartZ = fround(currentPositionZ + RESULT[2]);
  INPUT[8] = fround(axisX * endDistance);
  INPUT[9] = fround(axisY * endDistance);
  INPUT[10] = fround(axisZ * endDistance);
  rotateVectorAt(INPUT, 4, INPUT, 8);
  const currentEndX = fround(currentPositionX - RESULT[0]);
  const currentEndY = fround(currentPositionY - RESULT[1]);
  const currentEndZ = fround(currentPositionZ - RESULT[2]);

  radius[0] = startRadius;
  radius[1] = endRadius;
  minimum[0] = smaller(fround(smaller(oldStartX, currentStartX) - startRadius), fround(smaller(oldEndX, currentEndX) - endRadius));
  minimum[1] = smaller(fround(smaller(oldStartY, currentStartY) - startRadius), fround(smaller(oldEndY, currentEndY) - endRadius));
  minimum[2] = smaller(fround(smaller(oldStartZ, currentStartZ) - startRadius), fround(smaller(oldEndZ, currentEndZ) - endRadius));
  maximum[0] = larger(fround(larger(oldStartX, currentStartX) + startRadius), fround(larger(oldEndX, currentEndX) + endRadius));
  maximum[1] = larger(fround(larger(oldStartY, currentStartY) + startRadius), fround(larger(oldEndY, currentEndY) + endRadius));
  maximum[2] = larger(fround(larger(oldStartZ, currentStartZ) + startRadius), fround(larger(oldEndZ, currentEndZ) + endRadius));
  const oldEnd = work.oldPositions[1];
  const nextEnd = work.nextPositions[1];
  oldStart[0] = oldStartX;
  oldStart[1] = oldStartY;
  oldStart[2] = oldStartZ;
  oldEnd[0] = oldEndX;
  oldEnd[1] = oldEndY;
  oldEnd[2] = oldEndZ;
  nextStart[0] = currentStartX;
  nextStart[1] = currentStartY;
  nextStart[2] = currentStartZ;
  nextEnd[0] = currentEndX;
  nextEnd[1] = currentEndY;
  nextEnd[2] = currentEndZ;
}

// Rebuilds the step pose down each chain: a moving particle with a parent takes its rest local pose under the parent's
// step pose, with the local position scaled by the rest scale in world units.
export function updateChainPose(simulation: SimulatedCloth): void {
  const mesh = simulation.mesh;
  const timing = simulation.timing;
  const stepPosePositions = simulation.stepPosePositions;
  const stepPoseRotations = simulation.stepPoseRotations;
  if (simulation.parameters.animationBlend > fround(0.99)) return;
  const scaleX = fround(timing.restScale[0] * timing.worldScaleRatio);
  const scaleY = fround(timing.restScale[1] * timing.worldScaleRatio);
  const scaleZ = fround(timing.restScale[2] * timing.worldScaleRatio);

  for (let chain = 0; chain < mesh.chainStart.length; chain++) {
    const chainStart = mesh.chainStart[chain];
    const chainCount = mesh.chainCount[chain];
    for (let chainEntry = 0; chainEntry < chainCount; chainEntry++) {
      const particle = mesh.chainData[chainStart + chainEntry];
      const parent = mesh.parentIndices[particle];
      const rotationOffset = particle * 4;
      if (isSimulated(mesh.attributes[particle]) && parent >= 0) {
        const parentRotationOffset = parent * 4;
        const parentOffset = parent * 3;
        const localPosition = mesh.vertexLocalPositions[particle];
        const localRotation = mesh.vertexLocalRotations[particle];
        INPUT[0] = fround(localPosition[0] * scaleX);
        INPUT[1] = fround(localPosition[1] * scaleY);
        INPUT[2] = fround(localPosition[2] * scaleZ);
        rotateVectorAt(stepPoseRotations, parentRotationOffset, INPUT, 0);
        setVector(
          stepPosePositions,
          particle * 3,
          fround(RESULT[0] + stepPosePositions[parentOffset]),
          fround(RESULT[1] + stepPosePositions[parentOffset + 1]),
          fround(RESULT[2] + stepPosePositions[parentOffset + 2]),
        );
        INPUT[0] = localRotation[0];
        INPUT[1] = localRotation[1];
        INPUT[2] = localRotation[2];
        INPUT[3] = localRotation[3];
        multiplyQuaternionsAt(stepPoseRotations, parentRotationOffset, INPUT, 0);
        setQuaternion(stepPoseRotations, rotationOffset, RESULT[4], RESULT[5], RESULT[6], RESULT[7]);
      } else {
        // Rebuilding the rotation from its forward and up axes renormalizes it.
        rebuildRotationAt(stepPoseRotations, rotationOffset);
        setQuaternion(stepPoseRotations, rotationOffset, LOOK_ROTATION[0], LOOK_ROTATION[1], LOOK_ROTATION[2], LOOK_ROTATION[3]);
      }
    }
  }
}
