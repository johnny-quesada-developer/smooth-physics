import { fround } from './float32/scalar.ts';
import { vector, type Vector3 } from './float32/vector.ts';
import { sampleCurve, scaleCurve, type SampledCurve } from './curves.ts';
import type { ClothConfiguration, CurveRecord, SpeedLimit } from './scene-format/types.ts';

export const TETHER_STRETCH_LIMIT = fround(0.03);
export const DISTANCE_VELOCITY_DAMPING = fround(0.3);

export type InertiaParameters = {
  anchorFollow: number;
  worldInertia: number;
  movementInertiaSmoothing: number;
  movementSpeedLimit: number;
  rotationSpeedLimit: number;
  localInertia: number;
  localMovementSpeedLimit: number;
  localRotationSpeedLimit: number;
  rootFollowShare: number;
  centrifugalShare: number;
  particleSpeedLimit: number;
  teleportMode: number;
  teleportDistance: number;
  teleportRotation: number;
};

// Mutable on purpose: apps may change parameters between frames (for example reversing gravity).
export type ClothParameters = {
  gravity: number;
  worldGravityDirection: Vector3;
  gravityFalloff: number;
  settleTime: number;
  influenceWeight: number;
  dampingCurve: SampledCurve;
  radiusCurve: SampledCurve;
  rotationFollow: number;
  rootRotationFollow: number;
  animationBlend: number;
  inertia: InertiaParameters;
  tether: { compressionLimit: number; stretchLimit: number };
  distance: { stiffnessCurve: SampledCurve; velocityDamping: number };
  bending: { stiffness: number };
  angle: {
    useRestoration: boolean;
    restorationStiffnessCurve: SampledCurve;
    restorationVelocityDamping: number;
    restorationGravityFalloff: number;
    useAngleLimit: boolean;
    limitCurve: SampledCurve;
    limitStiffness: number;
  };
  motion: {
    useMaxDistance: boolean;
    maxDistanceCurve: SampledCurve;
    useBehindLimit: boolean;
    behindLimitRadius: number;
    behindLimitDistanceCurve: SampledCurve;
    behindLimitAxis: number;
    stiffness: number;
  };
  collider: { mode: number; dynamicFriction: number; staticFriction: number };
};

// A disabled limit is -1, which the solver reads as "no limit".
const limitValue = (limit: SpeedLimit): number => (limit.use ? fround(limit.value) : -1);

export function clothParameters(configuration: ClothConfiguration): ClothParameters {
  const curves = new Map<string, SampledCurve>();
  const curveRecords: readonly (readonly [string, CurveRecord])[] = [
    ['damping', configuration.damping],
    ['radius', configuration.radius],
    ['distance', configuration.distanceStiffness],
    ['restoration', configuration.restoration.stiffness],
    ['limit', configuration.angleLimit.limitAngle],
    ['maxDistance', configuration.motion.maxDistance],
    ['behindLimit', configuration.motion.behindLimitDistance],
  ];
  for (const [name, record] of curveRecords) {
    curves.set(name, sampleCurve(record));
  }
  const curve = (name: string): SampledCurve => curves.get(name) ?? [];

  const inertia = configuration.inertia;
  const gravityDirection = configuration.gravityDirection;
  return {
    gravity: fround(configuration.gravity),
    worldGravityDirection: vector(gravityDirection.x, gravityDirection.y, gravityDirection.z),
    gravityFalloff: fround(configuration.gravityFalloff),
    settleTime: fround(configuration.settleTime),
    influenceWeight: fround(configuration.influenceWeight),
    dampingCurve: scaleCurve(curve('damping'), fround(0.2)),
    radiusCurve: curve('radius'),
    rotationFollow: fround(configuration.rotationFollow),
    rootRotationFollow: fround(configuration.rootRotationFollow),
    animationBlend: fround(configuration.animationBlend),
    inertia: {
      anchorFollow: fround(inertia.anchorFollow),
      worldInertia: fround(inertia.worldInertia),
      movementInertiaSmoothing: fround(inertia.movementInertiaSmoothing),
      movementSpeedLimit: limitValue(inertia.movementSpeedLimit),
      rotationSpeedLimit: limitValue(inertia.rotationSpeedLimit),
      localInertia: fround(inertia.localInertia),
      localMovementSpeedLimit: limitValue(inertia.localMovementSpeedLimit),
      localRotationSpeedLimit: limitValue(inertia.localRotationSpeedLimit),
      rootFollowShare: fround(inertia.rootFollowShare),
      centrifugalShare: fround(inertia.centrifugalShare),
      particleSpeedLimit: limitValue(inertia.particleSpeedLimit),
      teleportMode: inertia.teleportMode,
      teleportDistance: fround(inertia.teleportDistance),
      teleportRotation: fround(inertia.teleportRotation),
    },
    tether: { compressionLimit: fround(configuration.compressionLimit), stretchLimit: TETHER_STRETCH_LIMIT },
    distance: { stiffnessCurve: curve('distance'), velocityDamping: DISTANCE_VELOCITY_DAMPING },
    bending: { stiffness: fround(configuration.bendingStiffness) },
    angle: {
      useRestoration: configuration.restoration.use,
      restorationStiffnessCurve: scaleCurve(curve('restoration'), fround(0.2)),
      restorationVelocityDamping: fround(configuration.restoration.velocityDamping),
      restorationGravityFalloff: fround(configuration.restoration.gravityFalloff),
      useAngleLimit: configuration.angleLimit.use,
      limitCurve: curve('limit'),
      limitStiffness: fround(configuration.angleLimit.stiffness),
    },
    motion: {
      useMaxDistance: configuration.motion.useMaxDistance,
      maxDistanceCurve: curve('maxDistance'),
      useBehindLimit: configuration.motion.useBehindLimit,
      behindLimitRadius: fround(configuration.motion.behindLimitRadius),
      behindLimitDistanceCurve: curve('behindLimit'),
      behindLimitAxis: configuration.motion.behindLimitAxis,
      stiffness: fround(configuration.motion.stiffness),
    },
    collider: {
      mode: configuration.colliderContact.mode,
      dynamicFriction: fround(configuration.colliderContact.friction),
      staticFriction: fround(configuration.colliderContact.friction),
    },
  };
}
