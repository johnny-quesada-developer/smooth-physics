import type * as Three from 'three';
import type { ClothSettingsInput, Precision, SystemOptions } from 'smooth-physics';
import type { ThreeClothAdapter, ThreeClothSpec, ThreeColliderSpec } from 'smooth-physics/three';

export type ControlValue = number | boolean | string;
export type ControlValues = Readonly<Record<string, ControlValue>>;

// When a control changes: 'tuning' retunes the running cloth, 'setup' rebuilds it, 'live' is read every frame.
export type ControlTiming = 'tuning' | 'setup' | 'live';

export type ThreadColor = 'lime' | 'honey' | 'sage' | 'stone';
// receiveShadow: false keeps shadows of props off the cloth, for a prop that moves inside the fabric.
export type ClothStyle = { readonly color: ThreadColor; readonly width?: number; readonly receiveShadow?: boolean };

export type GrabPlane = { readonly normal: readonly [number, number, number]; readonly minimum: number };

export type CameraFraming = {
  readonly target: readonly [number, number, number];
  readonly distance: number;
  readonly height: number;
  readonly azimuth?: number;
  // The stage shape, width over height, the framing is composed for: a narrower stage widens its view to see as far
  // across. 16:10 by default.
  readonly aspect?: number;
};

// A box in world space, in metres.
export type SubjectBounds = { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };

export type SceneSetup = { readonly cloths: readonly ThreeClothSpec[]; readonly colliders: readonly ThreeColliderSpec[]; readonly options?: SystemOptions };

export type SceneDefinition = {
  readonly root: Three.Object3D;
  readonly camera: CameraFraming;
  // The box the scene's action stays inside at the moment, cloth included, such as the current clip's. The camera keeps
  // it in frame, and on a stage narrower than the framing's design fits it, centred, as large as it fits.
  subject?(): SubjectBounds | null;
  // Keyed by cloth name.
  readonly styles: Readonly<Record<string, ClothStyle>>;
  // Props the reader can pick up on an interactive stage, usually a collider's object that animate() moves. While held,
  // a prop follows the pointer; after release it eases back onto its animated path.
  readonly grabbable?: readonly Three.Object3D[];
  // The plane a held prop moves in, for a cloth that hangs across the view. Without it the plane faces the camera, so
  // a sideways drag from an angled camera also moves the prop into or out of the cloth; a fast one carries it through
  // the fabric before the dent can spread. normal is the cloth's front, and the prop stays at least minimum along it.
  readonly grabPlane?: GrabPlane;
  setup(values: ControlValues): SceneSetup;
  // Settings for each cloth by name, applied to the running cloth when a 'tuning' control changes.
  tuning?(values: ControlValues): Readonly<Record<string, ClothSettingsInput>>;
  // System settings such as precision or rate, applied after every change.
  configure?(input: { readonly values: ControlValues; readonly cloth: ThreeClothAdapter }): void;
  // Called every frame after the cloth restored its rest pose and before it simulates.
  animate(input: { readonly values: ControlValues; readonly time: number; readonly deltaTime: number; readonly cloth: ThreeClothAdapter }): void;
  act?(input: { readonly action: string; readonly cloth: ThreeClothAdapter }): void;
};

export type StageStatistics = {
  readonly framesPerSecond: number;
  readonly physicsMilliseconds: number;
  readonly particles: number;
  readonly stepsPerFrame: number;
  readonly contacts: number;
  readonly frequency: number;
  readonly precision: Precision;
  readonly quality: 'full' | 'reduced' | 'minimum';
  readonly thread: 'main' | 'worker';
};
