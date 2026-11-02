import { curve, ease, lerp, lerpAngle, type Curve, type Key } from './curves';
import { pelvisHeight, type Flight } from './flight';
import { sampleFoot, SHUFFLE, type FootSample, type Plant, type StepStyle } from './footwork';
import { placeFoot, placeFootFromPelvis, placeRoot } from './placement';
import { copyPose, sign, SIDES, type Pose, type Side } from './pose';

export type HandKey = readonly [time: number, x: number, y: number, z: number];
export type Vector3 = readonly [x: number, y: number, z: number];

type BodyField =
  | 'pelvisX'
  | 'pelvisZ'
  | 'pelvisPitch'
  | 'pelvisYaw'
  | 'pelvisRoll'
  | 'spinePitch'
  | 'spineYaw'
  | 'spineRoll'
  | 'chestPitch'
  | 'chestYaw'
  | 'chestRoll'
  | 'headPitch'
  | 'headYaw'
  | 'headRoll';

// A foot that leaves the floor for a while: it fades in from start to full, follows its target, and fades back
// to its footsteps from release to end. Pelvis targets fold with the body; root targets turn with the fighter.
export type AirMove = {
  readonly sides: readonly Side[];
  readonly start: number;
  readonly full: number;
  readonly release: number;
  readonly end: number;
  readonly frame: 'pelvis' | 'root';
  target(input: { side: Side; time: number }): Vector3;
  // The foot's pitch in the root frame while in the air, and its yaw relative to the fighter, if they change.
  pitch?(input: { side: Side; time: number; pose: Pose }): number;
  yaw?: number;
};

export type Choreography = {
  readonly x: Curve;
  readonly yaw: Curve;
  readonly height: Curve;
  readonly flights: readonly Flight[];
  readonly body: Partial<Record<BodyField, Curve>>;
  readonly hands: Readonly<Record<Side, HandKey[]>>;
  readonly elbows?: Partial<Record<Side, Curve>>;
  readonly plants: Readonly<Record<Side, readonly Plant[]>>;
  readonly air: readonly AirMove[];
  readonly step?: StepStyle;
};

export type Performance = (input: { time: number; pose: Pose }) => void;

// Turns keyframe tracks into a pose function; fields without a track keep the base pose's value.
export function perform({ choreography, base }: { choreography: Choreography; base: Pose }): Performance {
  const hands: Readonly<Record<Side, VectorTrack>> = { l: vectorTrack(choreography.hands.l), r: vectorTrack(choreography.hands.r) };
  const foot: FootSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const root = { x: 0, z: 0, yaw: 0 };
  return ({ time, pose }) => {
    copyPose({ from: base, to: pose });
    root.x = choreography.x(time);
    root.yaw = choreography.yaw(time);
    placeRoot({ pose, root });
    pose.pelvisY = pelvisHeight({ flights: choreography.flights, ground: choreography.height, time });
    for (const [field, track] of Object.entries(choreography.body)) if (isBodyField(field) && track) pose[field] = track(time);
    for (const side of SIDES) {
      const hand = hands[side];
      pose[`${side}HandX`] = hand.x(time);
      pose[`${side}HandY`] = hand.y(time);
      pose[`${side}HandZ`] = hand.z(time);
      const elbow = choreography.elbows?.[side];
      if (elbow) pose[`${side}Elbow`] = elbow(time);
      placeFoot({ pose, side, foot: sampleFoot({ plants: choreography.plants[side], time, style: choreography.step ?? SHUFFLE, out: foot }) });
    }
    for (const move of choreography.air) {
      if (time <= move.start || time >= move.end) continue;
      const amount = ease(time, move.start, move.full) * (1 - ease(time, move.release, move.end));
      for (const side of move.sides) liftFoot({ move, side, time, amount, pose });
    }
  };
}

function liftFoot({ move, side, time, amount, pose }: { move: AirMove; side: Side; time: number; amount: number; pose: Pose }): void {
  const [x, y, z] = move.target({ side, time });
  if (move.frame === 'pelvis') placeFootFromPelvis({ pose, side, x, y, z, amount });
  else {
    pose[`${side}FootX`] = lerp(pose[`${side}FootX`], x, amount);
    pose[`${side}FootY`] = lerp(pose[`${side}FootY`], y, amount);
    pose[`${side}FootZ`] = lerp(pose[`${side}FootZ`], z, amount);
  }
  if (move.pitch) pose[`${side}FootPitch`] = lerpAngle(pose[`${side}FootPitch`], move.pitch({ side, time, pose }), amount);
  if (move.yaw !== undefined) pose[`${side}FootYaw`] = lerpAngle(pose[`${side}FootYaw`], sign(side) * move.yaw, amount);
}

const BODY_FIELDS: ReadonlySet<string> = new Set<BodyField>([
  'pelvisX',
  'pelvisZ',
  'pelvisPitch',
  'pelvisYaw',
  'pelvisRoll',
  'spinePitch',
  'spineYaw',
  'spineRoll',
  'chestPitch',
  'chestYaw',
  'chestRoll',
  'headPitch',
  'headYaw',
  'headRoll',
]);
const isBodyField = (field: string): field is BodyField => BODY_FIELDS.has(field);

type VectorTrack = { readonly x: Curve; readonly y: Curve; readonly z: Curve };

export function vectorTrack(keys: readonly HandKey[]): VectorTrack {
  const component = (index: 1 | 2 | 3): Curve => curve(keys.map((key): Key => [key[0], key[index]]));
  return { x: component(1), y: component(2), z: component(3) };
}
