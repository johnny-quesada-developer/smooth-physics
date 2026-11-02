import * as THREE from 'three';
import { DESIGN_ASPECT, FIELD_OF_VIEW, fieldOfView } from './fieldOfView';
import type { CameraFraming, SubjectBounds } from './types';

// Room around the subject for the camera's sway and the reader's orbit, as a share of the view.
const MARGIN = 0.06;
// How long the camera takes to cover about two thirds of the way to a new subject, such as the next clip's.
const FOLLOW_SECONDS = 0.35;
// Below the framing's design shape the camera moves over from the design to fitting the subject; this share of the
// design narrower, it fits the subject alone.
const BLEND_SPAN = 0.25;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Frames a scene's subject, such as the fighters and their cloth through a clip. Fitted, the camera centres the subject
// and shows it as large as the stage allows, whatever the stage's shape. Otherwise a stage as wide as the framing's
// design or wider keeps the design, and a narrower one moves over to the fit. shift moves the camera and its target
// together; fov is the vertical field of view in degrees.
export default class SubjectFraming {
  readonly shift = new THREE.Vector3();
  fov = FIELD_OF_VIEW;
  private readonly framing: CameraFraming;
  private readonly goal = { shift: new THREE.Vector3(), fov: 0 };
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly corner = new THREE.Vector3();

  constructor(framing: CameraFraming) {
    this.framing = framing;
  }

  // Without a time step the framing jumps to the goal, as after a resize; with one it eases there.
  update({ aspect, subject, fit, deltaTime }: { aspect: number; subject: SubjectBounds | null; fit: boolean; deltaTime: number | null }): void {
    this.aim({ aspect, subject, fit });
    const amount = deltaTime === null ? 1 : 1 - Math.exp(-deltaTime / FOLLOW_SECONDS);
    this.shift.lerp(this.goal.shift, amount);
    this.fov += (this.goal.fov - this.fov) * amount;
  }

  // Measured from where the camera rests, so the reader's orbit and zoom work on top of the framing.
  private aim({ aspect, subject, fit }: { aspect: number; subject: SubjectBounds | null; fit: boolean }): void {
    const design = this.framing.aspect ?? DESIGN_ASPECT;
    const designed = fieldOfView({ aspect, design });
    const { goal, eye, target, forward, right, up, corner } = this;
    if (!subject) {
      goal.shift.set(0, 0, 0);
      goal.fov = designed;
      return;
    }
    const weight = fit ? 1 : THREE.MathUtils.clamp((design - aspect) / (design * BLEND_SPAN), 0, 1);
    const { distance, height, azimuth = 0 } = this.framing;
    target.fromArray(this.framing.target);
    eye.set(target.x + Math.sin(azimuth) * distance, height, target.z + Math.cos(azimuth) * distance);
    forward.subVectors(target, eye).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    up.crossVectors(right, forward);
    const { min, max } = subject;
    corner.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).sub(target);
    goal.shift
      .copy(right)
      .multiplyScalar(corner.dot(right) * weight)
      .addScaledVector(up, corner.dot(up) * weight);
    eye.add(goal.shift);
    let half = 0;
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          corner.set(x, y, z).sub(eye);
          const depth = corner.dot(forward);
          if (depth <= 0) continue;
          half = Math.max(half, Math.abs(corner.dot(up)) / depth, Math.abs(corner.dot(right)) / depth / aspect);
        }
    const fitted = THREE.MathUtils.radToDeg(2 * Math.atan(half * (1 + MARGIN)));
    goal.fov = weight * fitted + (1 - weight) * designed;
  }
}
