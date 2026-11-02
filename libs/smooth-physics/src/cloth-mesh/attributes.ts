export const Attribute = {
  Pinned: 0x01,
  Simulated: 0x02,
  SkipMotionLimit: 0x08,
  SkipCollision: 0x10,
  CoincidentWithParent: 0x20,
  InTriangle: 0x80,
} satisfies Readonly<Record<string, number>>;

export const isSimulated = (attribute: number): boolean => (attribute & Attribute.Simulated) !== 0;
export const isPinned = (attribute: number): boolean => (attribute & Attribute.Pinned) !== 0;
export const isExcluded = (attribute: number): boolean => (attribute & (Attribute.Pinned | Attribute.Simulated)) === 0;
export const isNotSimulated = (attribute: number): boolean => (attribute & Attribute.Simulated) === 0;

export const Connection = { Line: 0, AutomaticMesh: 1, LoopMesh: 2, SequenceMesh: 3 } satisfies Readonly<Record<string, number>>;

// The sign stored for volume pairs, which share the bending pair list.
export const VOLUME_SIGN = 100;
